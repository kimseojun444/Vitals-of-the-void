"""Vitals in the Void – web API (Starlette, the framework FastAPI is built on) + static frontend.

Run:  python run.py   then open http://localhost:8000
"""
import asyncio
import base64
import contextlib
import json
import time
import math
from datetime import datetime, timezone
from pathlib import Path

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from . import countermeasures as CMS
from . import rash as RASH
from . import reference as RF
from . import services as SV
from .ai import hooks as AI
from .db import DB
from .journal import PROMPTS, Journal
from .model import AGE, LV, SRC, Crew, Store, fmt, new_crew_dict
from .supplies import CATS, FOOD_TYPES, LEAD_DEFAULT, Supplies, starter_inventory
from .wearable import Wearables
from . import drift as DRIFT

FRONT = Path(__file__).resolve().parent.parent / "frontend"
store = Store(DB())
supplies = Supplies(store)
journal = Journal(store.db)
wear = Wearables(store)
LIVE_BUF = {}


def J(x, status=200):
    return JSONResponse(_clean(x), status_code=status)


def _clean(x):
    if isinstance(x, float):
        return None if not math.isfinite(x) else round(x, 5)
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    return x


def err(msg, status=400):
    return J({"error": msg}, status)


def crew_or_404(cid):
    c = store.crew.get(cid)
    if not c:
        raise KeyError(cid)
    return c


# ------------------------------------------------------------------ serializers
def guidance(c: Crew, vid, st, lvl):
    g = CMS.for_var(vid, st["dir"], lvl)
    if not g:
        return None
    sup = supplies.for_tags(g["sup"])
    for s in sup:
        if s["st"] == 2 or not s["known"]:
            s["advice"] = ("Not in the inventory: use the non-drug steps and ask the flight surgeon for an alternative."
                           if not s["known"] else "Stock critical: use sparingly and request resupply now.")
    return {"steps": g["steps"], "supplies": sup, "refs": [RF.REFS[r] for r in g["ref"] if r in RF.REFS]}


def item_json(c, it, with_guidance=True):
    v = RF.VM[it["v"]]
    st, r = it["st"], it["r"]
    o = {"v": v["id"], "n": v["n"], "u": v["u"], "dp": v.get("dp", 1), "value": r[3], "day": r[2], "src": SRC.get(r[4], r[4]),
         "E": st["E"], "tol": st["tol"], "lvl": it["lvl"], "why": st["why"], "note": it.get("note", ""), "z": st["z"],
         "calc": v["f"] == "calc", "expBad": st["expBad"], "n_off": st.get("n", 0), "need": st.get("need", 0), "recovering": st.get("recovering", False)}
    if with_guidance and it["lvl"] > 0:
        o["guide"] = guidance(c, v["id"], st, it["lvl"])
    return o


def cond_json(c, cid, d, mode, full=False):
    k = RF.CM[cid]
    s = c.cond_status(cid, d, mode)
    has = bool(s["items"] or s["sym"])
    o = {"id": cid, "n": k["n"], "short": k["short"], "lvl": s["lvl"] if has else None, "missing": s["missing"], "total": s["total"],
         "sym": [x[1] for x in s["sym"]], "combo": s["combo"], "count": len(s["items"])}
    top = next((i for i in s["items"] if i["lvl"] > 0), None)
    o["top"] = item_json(c, top, False) if top else None
    if full:
        o.update(info=k["info"], haz=k["haz"], act=k["act"], esc=k["esc"], refs=[RF.REFS[r] for r in k.get("ref", []) if r in RF.REFS],
                 items=[item_json(c, i, True) for i in s["items"]])
        if s["sym"]:
            o["symGuide"] = [{"t": x[1], "lvl": 2 if len(x) > 3 and x[3] == 2 else 1} for x in s["sym"]]
    return o


def crew_summary(c):
    d = c.now_day()
    filled = sum(1 for v in RF.VARS if v["f"] not in ("calc", "eva") and not v.get("env") and str((c.d.get("base") or {}).get(v["id"], "")) != "")
    total = sum(1 for v in RF.VARS if v["f"] not in ("calc", "eva") and not v.get("env"))
    lvl = max((c.cond_status(k["id"], d)["lvl"] for k in RF.CONDS), default=0) if c.recs else None
    return {**{k: v for k, v in c.d.items() if k != "base"}, "filled": filled, "total": total, "lvl": lvl, "day": d}


def header(c):
    d = c.now_day()
    e = RF.ENVS[c.env_at(d)]
    return {"day": d, "env": e["n"], "g": e["g"], "phase": c.phase_info(d), "comm": c.comm_delay(d), "A": c.adapt_A(),
            "clock": store.settings.get("clock"), "date": c.date_of(d).date().isoformat()}


# ------------------------------------------------------------------ meta & settings
async def meta(req):
    return J({"VARS": RF.VARS, "CONDS": [{k: v for k, v in c.items()} for c in RF.CONDS], "ENVS": RF.ENVS, "MISSIONS": RF.MISSIONS, "BODY": RF.BODY,
              "SYMPTOMS": RF.SYMPTOMS, "FX": RF.FXT, "S2": RF.S2, "PANELS": RF.PANELS, "TASKS": RF.TASKS, "REFS": RF.REFS, "LV": LV, "SRC": SRC,
              "SUPPLY_TAGS": CMS.SUPPLY_TAGS, "CATS": CATS, "FOOD_TYPES": FOOD_TYPES, "RASH_Q": RASH.QUESTIONS, "PROMPTS": PROMPTS,
              "LIVEV": SV.LIVEV, "LEAD_DEFAULT": LEAD_DEFAULT, "ai": AI.is_enabled()})


async def state(req):
    return J({"settings": store.settings, "crew": [crew_summary(c) for c in store.crew.values()]})


async def alerts(req):
    """Status dots for the sidebar: 0 nominal, 1 warning, 2 alert, None = nothing to show."""
    cid = req.query_params.get("cid") or store.settings.get("sel")
    c = store.crew.get(cid) if cid else None
    out = {}
    if c and c.recs:
        d = c.now_day()
        out["monitor"] = max(((c.cond_status(k["id"], d)["lvl"] or 0) for k in RF.CONDS if k["id"] != "eva"), default=0)
        out["eva"] = c.cond_status("eva", d)["lvl"] or 0
        rows = store.db.q("SELECT day, data FROM rash WHERE crew_id=?", (c.id,))
        rl = 0
        for day, x in rows:
            x = json.loads(x)
            if x.get("status") != "cleared" and d - day <= 14:
                rl = max(rl, 2 if x.get("flags") else 1)
        out["rash"] = rl
    others = [crew_summary(o)["lvl"] or 0 for o in store.crew.values() if o is not c]
    out["crew"] = max(others, default=0)
    if c:
        out["monitor"] = max(out.get("monitor", 0) or 0, wear.battery(c.id)["lvl"])
    fc = [it["fc"] for it in supplies.summary()]
    out["supplies"] = 2 if any(f["state"] == "critical" for f in fc) else 1 if any(f["state"] == "order" for f in fc) else 0
    return J({k: v for k, v in out.items() if v})


async def settings(req):
    b = await req.json()
    for k in ("avatar", "clock", "k2", "lead", "margin", "onboarded", "sel"):
        if k in b:
            store.settings[k] = b[k]
    store.save_settings()
    for c in store.crew.values():
        c.reset()
    return J(store.settings)


# ------------------------------------------------------------------ crew & baselines
async def crew_save(req):
    b = await req.json()
    cid = b.get("id")
    if cid and cid in store.crew:
        c = store.crew[cid]
        for k in ("name", "role", "age", "sex", "weight", "hand", "mission", "launch", "A0"):
            if k in b:
                c.d[k] = b[k]
        if b.get("weight") not in (None, ""):
            c.d.setdefault("base", {})["mass"] = float(b["weight"])
    else:
        d = new_crew_dict(**{k: b[k] for k in ("name", "role", "age", "sex", "weight", "hand", "mission", "launch", "A0") if k in b})
        if b.get("weight") not in (None, ""):
            d["base"]["mass"] = float(b["weight"])
        c = Crew(store, d)
        store.crew[c.id] = c
    store.save_crew(c)
    return J(crew_summary(c))


async def crew_delete(req):
    store.delete_crew(req.path_params["cid"])
    return J({"ok": True})


async def baselines_get(req):
    c = crew_or_404(req.path_params["cid"])
    rows = []
    for v in RF.VARS:
        if v.get("env") or v["f"] == "eva":
            continue
        rows.append({"v": v["id"], "n": v["n"], "u": v["u"], "cat": RF.CM[v["c"][0]]["short"], "pop": v["b"], "dp": v.get("dp", 1),
                     "val": (c.d.get("base") or {}).get(v["id"]), "inv": v["inv"], "calc": v["f"] == "calc"})
    return J({"name": c.d["name"], "rows": rows})


async def baselines_save(req):
    c = crew_or_404(req.path_params["cid"])
    b = await req.json()
    base = c.d.setdefault("base", {})
    for k, v in (b.get("values") or {}).items():
        if k not in RF.VM:
            continue
        if v in (None, ""):
            base.pop(k, None)
        else:
            try:
                base[k] = float(v)
            except ValueError:
                pass
    if b.get("reset"):
        c.d["base"] = {}
    store.save_crew(c)
    return J(crew_summary(c))


async def baselines_upload(req):
    form = await req.form()
    f = form["file"]
    data = await f.read()
    name = f.filename.lower()
    pairs = []
    if name.endswith((".xlsx", ".xlsm")):
        import io
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
        for ws in wb:
            for r in ws.iter_rows(values_only=True):
                pairs.append([str(x) if x is not None else "" for x in r])
    else:
        import csv
        import io
        pairs = list(csv.reader(io.StringIO(data.decode("utf-8", "replace"))))
    out = {}
    for r in pairs:
        if len(r) < 2:
            continue
        key = SV.map_metric(r[0]) or SV.map_metric(r[1] if len(r) > 2 else "")
        val = r[1] if SV.map_metric(r[0]) else (r[2] if len(r) > 2 else "")
        if not key:
            # allow "name,value,unit" using variable display names
            key = next((v["id"] for v in RF.VARS if v["n"].lower() == str(r[0]).strip().lower()), None)
        try:
            if key:
                out[key] = float(str(val).strip())
        except ValueError:
            pass
    return J({"values": out, "count": len(out)})


async def sample(req):
    # every load gives a new, different simulated crew: the previous sample crew (never real astronauts) is replaced
    for cid in [c.id for c in store.crew.values() if c.d.get("sample")]:
        store.delete_crew(cid)
        for k in ("streams", "battery", "uplink"):
            (store.settings.get(k) or {}).pop(cid, None)
        LIVE_BUF.pop(cid, None)
        LIVE_LAST.pop(cid, None)
    made = SV.make_sample_crew(store)
    store.settings["sel"] = made[0].id
    if not supplies.items():
        for it in starter_inventory(3):
            supplies.save(it)
    store.settings["onboarded"] = True
    store.save_settings()
    return await state(req)


# ------------------------------------------------------------------ monitor
async def overview(req):
    c = crew_or_404(req.path_params["cid"])
    mode = req.query_params.get("mode", "monitor")
    d = c.now_day()
    conds = [cond_json(c, k["id"], d, mode) for k in RF.CONDS]
    conds.sort(key=lambda x: (-(x["lvl"] if x["lvl"] is not None else -1), x["short"]))
    regions = {r: c.region_lvl(r, d, mode) for r in RF.BODY}
    tiles = []
    for vid in SV.LIVEV:
        r, st = c.status_latest(vid, d, AGE["cont"])
        E, t = c.expected(vid, d), c.tol(vid, d)
        spark = [[x[2], x[3]] for x in c.of_var(vid) if d - 14 < x[2] <= d]
        tiles.append({"v": vid, "n": RF.VM[vid]["n"], "u": RF.VM[vid]["u"], "dp": RF.VM[vid].get("dp", 1), "value": r[3] if r else None,
                      "ago": d - r[2] if r else None, "E": E, "lo": E - 2 * t, "hi": E + 2 * t, "lvl": st["lvl"] if st else None,
                      "note": st.get("note", "") if st else "", "spark": spark})
    sched = []
    for v in RF.VARS:
        if v["f"] in ("cont", "eva", "calc"):
            continue
        r, st = c.status_latest(v["id"], d, AGE[v["f"]] if not v["inv"] else 7.5)
        r0 = c.latest(v["id"], d)
        sched.append({"v": v["id"], "n": v["n"], "u": v["u"], "dp": v.get("dp", 1), "f": v["f"], "inv": v["inv"], "latest": r0[3] if r0 else None,
                      "ago": d - r0[2] if r0 else None, "E": c.expected(v["id"], d), "lvl": st["lvl"] if st else None,
                      "due": r0 is None or d - r0[2] >= {"daily": 1, "d2": 2, "d3": 3}.get(v["f"], 7) - 0.05})
    urgent = any(ci["lvl"] == 2 and ci["top"] and "safety" in (ci["top"]["why"] or "").lower() for ci in conds) or \
        any(len(s) > 3 and s[3] == 2 for s in RF.SYMPTOMS if any(r[1] == "sym_" + s[0] for r in c.symptoms_recent(d)))
    actions, seen = [], set()
    for k in RF.CONDS:
        for it in c.cond_status(k["id"], d, mode)["items"]:
            if it["lvl"] > 0 and it["v"] not in seen:
                seen.add(it["v"])
                o = item_json(c, it, True)
                o["cond"] = k["short"]
                actions.append(o)
    actions.sort(key=lambda x: (-x["lvl"], -abs(x["z"])))
    return J({"crew": crew_summary(c), "hdr": header(c), "index": c.crew_index(d), "conds": conds, "regions": regions, "tiles": tiles,
              "sched": sched, "urgent": urgent, "mode": mode, "actions": actions[:10]})


async def condition(req):
    c = crew_or_404(req.path_params["cid"])
    return J(cond_json(c, req.path_params["kid"], c.now_day(), req.query_params.get("mode", "monitor"), True))


async def region(req):
    c = crew_or_404(req.path_params["cid"])
    r = req.path_params["rid"]
    d = c.now_day()
    mode = req.query_params.get("mode", "monitor")
    return J({"id": r, **RF.BODY[r], "conds": [cond_json(c, k, d, mode, True) for k in RF.BODY[r]["c"]]})


async def var_detail(req):
    c = crew_or_404(req.path_params["cid"])
    vid = req.path_params["vid"]
    v = RF.VM[vid]
    d = c.now_day()
    q = req.query_params
    frm = float(q.get("from", -5))
    to = float(q.get("to", max(d + 3, 10)))
    recs = c.of_var(vid)
    ss = c.status_series(vid)
    pts = [{"id": r[0], "day": r[2], "val": r[3], "src": SRC.get(r[4], r[4]), "lvl": s["lvl"], "E": s["E"], "why": s["why"], "note": s.get("note", "")}
           for r, s in zip(recs, ss) if frm <= r[2] <= to]
    step = max(0.5, (to - frm) / 160)
    band, x = [], frm
    while x <= to + 1e-9:
        band.append([round(x, 2), c.expected(vid, x), c.tol(vid, x)])
        x += step
    r, st = c.status_latest(vid, d)
    fxk = RF.FX_BY_VAR.get(vid)
    out = {"v": vid, "n": v["n"], "u": v["u"], "dp": v.get("dp", 1), "f": v["f"], "inv": v["inv"], "how": v.get("how", ""), "conds": [RF.CM[k]["short"] for k in v["c"]],
           "base": c.B(vid), "E": c.expected(vid, d), "tol": c.tol(vid, d), "lims": c.lims(vid), "pts": pts, "band": band,
           "phases": [{**p, "n": RF.ENVS[p["e"]]["n"]} for p in c.phases()], "today": d, "from": frm, "to": to,
           "rho": c.rho(vid), "rho_n": c.rho_n(vid), "A": c.adapt_A(), "s2": v.get("s2"), "formula": RF.FXT[fxk]["t"] if fxk else None,
           "latest": {"value": r[3], "day": r[2], "lvl": st["lvl"], "why": st["why"], "note": st.get("note", ""), "expBad": st["expBad"]} if r else None,
           "n_total": len(recs)}
    if r and st["lvl"] > 0:
        out["guide"] = guidance(c, vid, st, st["lvl"])
    t = c.trend(vid, d)
    out["trend"] = t
    if vid == "dose":
        out["dose"] = {"cum": c.cum_dose(d), "d30": c.dose30(d)}
    return J(out)


async def records_add(req):
    c = crew_or_404(req.path_params["cid"])
    b = await req.json()
    d = c.now_day()
    days = set()
    feedback = []
    for it in b.get("items", []):
        vid = it.get("v")
        day = float(it["day"]) if it.get("day") not in (None, "") else d
        if vid and vid.startswith("sym_"):
            c.add(vid, day, 1, it.get("src", "m"), derive=False)
            continue
        if vid not in RF.VM:
            continue
        r = c.add(vid, day, it.get("value"), it.get("src", "m"), derive=False)
        if r:
            days.add(day)
    for dd in days:
        c.derive(dd)
    for it in b.get("items", []):
        vid = it.get("v")
        if vid in RF.VM:
            r, st = c.status_latest(vid, max(days) if days else d)
            if r and st:
                fb = {"v": vid, "n": RF.VM[vid]["n"], "u": RF.VM[vid]["u"], "value": r[3], "lvl": st["lvl"], "why": st["why"], "note": st.get("note", ""), "E": st["E"]}
                if st["lvl"] > 0:
                    fb["guide"] = guidance(c, vid, st, st["lvl"])
                feedback.append(fb)
    return J({"ok": True, "feedback": feedback})


async def record_delete(req):
    rid = int(req.path_params["rid"])
    for c in store.crew.values():
        r = c.delete(rid)
        if r:
            c.derive(r[2])
            return J({"ok": True, "rec": r})
    return err("Not found", 404)


async def records_delete_many(req):
    """Delete several records at once (History multi-select). Returns them so the action can be undone."""
    ids = [int(x) for x in (await req.json()).get("ids", [])]
    out, touched = [], {}
    for rid in ids:
        for c in store.crew.values():
            r = c.delete(rid)
            if r:
                out.append(r)
                touched[c.id] = min(touched.get(c.id, r[2]), r[2])
                break
    for cid, d in touched.items():
        store.crew[cid].derive(d)
    return J({"ok": True, "recs": out})


async def parse(req):
    b = await req.json()
    p = SV.parse_utterance(b.get("text", ""), b.get("scope") or None)
    cid = b.get("cid")
    out = []
    if cid in store.crew:
        c = store.crew[cid]
        d = c.now_day()
        for vid, x in p["vals"]:
            st = c.status_value(vid, x, d)
            out.append({"v": vid, "n": RF.VM[vid]["n"], "u": RF.VM[vid]["u"], "value": x, "lvl": st["lvl"], "why": st["why"]})
    return J({"vals": out, "sym": [{"id": s, "n": next((x[1] for x in RF.SYMPTOMS if x[0] == s), s)} for s in p["sym"]]})


def live_step(c, inject="none", flush=False):
    """One wearable sample for astronaut c: judged with the persistence rule; buffered and saved every 5 minutes."""
    d = c.now_day()
    vals = SV.live_values(c, d, inject)
    buf = LIVE_BUF.setdefault(c.id, {"n": 0, "v": {}, "runs": {}, "t0": time.time()})
    buf["n"] += 1
    out = []
    tsim = d + buf["n"] * 5 / 1440  # simulated stream: each sample stands for 5 minutes of wearable time
    from .model import PERSIST
    n1, n2, span = PERSIST["cont"]
    for vid, x in vals.items():
        buf["v"].setdefault(vid, []).append(x)
        run = buf["runs"].setdefault(vid, [])
        st = c._apply_persist(c.grade(vid, x, d), [None, vid, tsim, x, "w"], run, n1, n2, span)
        o = {"v": vid, "value": x, "lvl": st["lvl"], "why": st["why"], "note": st.get("note", ""), "E": st["E"]}
        if st["lvl"] > 0:
            o["guide"] = guidance(c, vid, st, st["lvl"])
        out.append(o)
    if flush or time.time() - buf["t0"] >= 300:
        for vid, xs in buf["v"].items():
            if xs:
                c.add(vid, d, sum(xs) / len(xs), "w", derive=False)
        c.derive(d)
        buf["v"], buf["t0"] = {}, time.time()
    LIVE_LAST[c.id] = {"vals": out, "t": time.time(), "n": buf["n"]}
    return out


LIVE_LAST = {}


def streams():
    return store.settings.setdefault("streams", {})


async def stream_loop():
    """Wearables stream continuously in the background for every astronaut whose stream is on, whatever page is open."""
    while True:
        await asyncio.sleep(2)
        for cid, inj in list(streams().items()):
            c = store.crew.get(cid)
            if not c:
                streams().pop(cid, None)
                continue
            try:
                if not wear.stream_tick(cid):          # battery empty: the band stops streaming
                    streams().pop(cid, None)
                    live_step(c, "none", flush=True)
                    LIVE_BUF.pop(cid, None)
                    LIVE_LAST.pop(cid, None)
                else:
                    live_step(c, inj or "none")
            except Exception as e:  # keep streaming the others
                print("stream error", cid, e)
        store.save_settings()


async def live_get(req):
    c = crew_or_404(req.path_params["cid"])
    s = streams()
    last = LIVE_LAST.get(c.id) if c.id in s else None
    return J({"streaming": c.id in s, "inject": s.get(c.id), "vals": last["vals"] if last else [], "n": last["n"] if last else 0})


async def stream_set(req):
    c = crew_or_404(req.path_params["cid"])
    b = await req.json()
    s = streams()
    if b.get("on"):
        s[c.id] = b.get("inject") or "none"
        if c.id not in LIVE_LAST:
            live_step(c, s[c.id])
    else:
        if c.id in s:
            s.pop(c.id)
            live_step(c, "none", flush=True)
            LIVE_BUF.pop(c.id, None)
            LIVE_LAST.pop(c.id, None)
    store.save_settings()
    return J({"streaming": c.id in s, "inject": s.get(c.id), "streams": s})


# ------------------------------------------------------------------ values from voice text, photo or file (assess, EVA, check-in)
# ------------------------------------------------------------------ EMERGENCY
EM_TYPES = {"medical": "Medical emergency", "fire": "Fire or smoke", "depress": "Depressurisation / leak", "toxic": "Toxic atmosphere",
            "injury": "Injury", "eva": "Spacewalk emergency", "other": "Other emergency"}


def _em_view():
    e = store.settings.get("emergency")
    if not e:
        return None
    now = time.time()
    sent, delay = e["t"], e["delay"]
    arrive = sent + delay                       # message reaches Mission Control
    ack = arrive + 12 + delay                   # Mission Control's acknowledgement travels back
    stage = "sending" if now < arrive else "received" if now < ack else "acknowledged"
    v = dict(e)
    v.update({"stage": stage, "arrive_in": max(0, arrive - now), "ack_in": max(0, ack - now), "now": now,
              "crew": [{"id": c.id, "name": c.d["name"], "role": c.d.get("role", "")} for c in store.crew.values()]})
    return v


async def emergency_get(req):
    return J({"emergency": _em_view(), "log": store.settings.get("emergency_log", [])[-10:]})


async def emergency_post(req):
    b = await req.json()
    cid = b.get("cid") or store.settings.get("sel")
    c = store.crew.get(cid)
    reporter = store.crew.get(b.get("by") or store.settings.get("sel"))
    d = c.now_day() if c else 0
    delay = wear.delay_seconds(c, d) if c else 2.0
    kind = b.get("type") if b.get("type") in EM_TYPES else "other"
    e = {"id": int(time.time() * 1000), "type": kind, "label": EM_TYPES[kind], "note": (b.get("note") or "").strip()[:500],
         "cid": cid, "who": c.d["name"] if c else "", "by": reporter.d["name"] if reporter else "", "day": round(d, 2),
         "env": c.env_at(d) if c else "", "t": time.time(), "delay": delay, "resolved": False}
    store.settings["emergency"] = e
    store.settings.setdefault("emergency_log", []).append(dict(e))
    store.save_settings()
    return J({"emergency": _em_view()})


async def emergency_resolve(req):
    b = await req.json() if (await req.body()) else {}
    e = store.settings.get("emergency")
    if e:
        for x in store.settings.get("emergency_log", []):
            if x["id"] == e["id"]:
                x["resolved"], x["resolved_at"], x["outcome"] = True, time.time(), (b.get("outcome") or "")[:300]
        store.settings["emergency"] = None
        store.save_settings()
    return J({"ok": True})


# ------------------------------------------------------------------ appearance (grain, translucency, wallpaper)
APPEAR_DEFAULT = {"grain": 0.5, "trans": 0.5, "wall": "anim:orbit", "dust": True, "custom": None}
WALL_DIR = Path(__file__).resolve().parent.parent / "data" / "wallpaper"
WALL_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
              ".avif": "image/avif", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime"}


def appearance():
    a = dict(APPEAR_DEFAULT)
    a.update(store.settings.get("appearance") or {})
    return a


async def appearance_get(req):
    return J(appearance())


async def appearance_post(req):
    b = await req.json()
    a = appearance()
    for k in ("grain", "trans"):
        if k in b:
            a[k] = max(0.0, min(1.0, float(b[k])))
    if "wall" in b:
        a["wall"] = str(b["wall"])[:60]
    if "dust" in b:
        a["dust"] = bool(b["dust"])
    store.settings["appearance"] = a
    store.save_settings()
    return J(a)


async def wallpaper_upload(req):
    form = await req.form()
    f = form.get("file")
    if f is None or not hasattr(f, "read"):
        return err("Choose an image or video")
    ext = Path(getattr(f, "filename", "") or "").suffix.lower()
    if ext not in WALL_TYPES:
        return err("Use an image (JPG, PNG, WebP, GIF, AVIF) or a video (MP4, WebM, MOV)")
    data = await f.read()
    if len(data) > 120 * 1024 * 1024:
        return err("That file is larger than 120 MB")
    WALL_DIR.mkdir(parents=True, exist_ok=True)
    for old in WALL_DIR.glob("custom.*"):
        old.unlink()
    (WALL_DIR / ("custom" + ext)).write_bytes(data)
    a = appearance()
    a["custom"] = {"name": getattr(f, "filename", "") or "Your wallpaper", "type": "video" if WALL_TYPES[ext].startswith("video") else "image", "v": int(time.time())}
    a["wall"] = "custom"
    store.settings["appearance"] = a
    store.save_settings()
    return J(a)


async def wallpaper_file(req):
    for p in WALL_DIR.glob("custom.*"):
        return FileResponse(p, media_type=WALL_TYPES.get(p.suffix.lower(), "application/octet-stream"))
    return Response(status_code=404)


async def drift_post(req):
    """Drift Vector forecast (read-only). Body: {horizon: 24|36|48, preset: id} or {env: {...}}."""
    c = crew_or_404(req.path_params["cid"])
    b = await req.json() if (await req.body()) else {}
    env = DRIFT.preset_env(c, b["preset"]) if b.get("preset") else b.get("env")
    return J(DRIFT.forecast(c, env, int(b.get("horizon") or 24)))


async def wearable_get(req):
    c = crew_or_404(req.path_params["cid"])
    return J({"battery": wear.battery(c.id), "uplink": wear.uplink(c, guidance)})


async def battery_post(req):
    c = crew_or_404(req.path_params["cid"])
    b = await req.json()
    msg = wear.battery_action(c.id, b.get("action"), b.get("value"))
    return J({"msg": msg, "battery": wear.battery(c.id)})


async def uplink_post(req):
    c = crew_or_404(req.path_params["cid"])
    b = await req.json()
    msg = wear.uplink_action(c, b.get("action"))
    return J({"msg": msg, "uplink": wear.uplink(c, guidance)})


async def wearable_events(req):
    since = int(req.query_params.get("since") or 0)
    ev = wear.events_since(since)
    last = store.settings.get("bat_events", [])
    return J({"events": ev, "last": last[-1]["id"] if last else 0})


async def extract(req):
    ct = req.headers.get("content-type", "")
    if ct.startswith("multipart"):
        form = await req.form()
        scope = json.loads(form.get("scope") or "null")
        f = form.get("file")
        data = await f.read() if f is not None and hasattr(f, "read") else None
        res = SV.extract_values(text=form.get("text"), filename=getattr(f, "filename", None), data=data, scope=scope)
    else:
        b = await req.json()
        res = SV.extract_values(text=b.get("text", ""), scope=b.get("scope"))
    if not res["vals"] and not res["note"]:
        res["note"] = "No values recognised. Name each measure followed by its number, e.g. ‘hemoglobin 14.2’."
    return J(res)


# ------------------------------------------------------------------ symptom reports (chips, voice description, photo)
async def symptom_report(req):
    c = crew_or_404(req.path_params["cid"])
    form = await req.form()
    syms = json.loads(form.get("symptoms") or "[]")
    note = (form.get("note") or "").strip()
    syms = sorted(set(syms) | set(SV.parse_utterance(note)["sym"]))
    f = form.get("file")
    img = await f.read() if f is not None and hasattr(f, "read") else None
    if not syms and not note and not img:
        return err("Choose a symptom, describe it or add a photo")
    d = c.now_day()
    for s in syms:
        c.add("sym_" + s, d, 1, form.get("src") or "m", derive=False)
    rid = store.db.x("INSERT INTO symptom_notes (crew_id, day, ts, symptoms, note, image) VALUES (?,?,?,?,?,?)",
                     (c.id, d, datetime.now(timezone.utc).isoformat(), json.dumps(syms), note, img or None))
    names = {x[0]: x[1] for x in RF.SYMPTOMS}
    return J({"id": rid, "symptoms": [{"id": s, "n": names.get(s, s)} for s in syms]})


async def symptom_list(req):
    names = {x[0]: x[1] for x in RF.SYMPTOMS}
    rows = store.db.q("SELECT id, day, ts, symptoms, note, image IS NOT NULL FROM symptom_notes WHERE crew_id=? ORDER BY id DESC LIMIT 20", (req.path_params["cid"],))
    return J([{"id": i, "day": d, "ts": ts, "symptoms": [names.get(s, s) for s in json.loads(sy)], "note": n, "has_img": bool(h)} for i, d, ts, sy, n, h in rows])


async def symptom_img(req):
    r = store.db.q("SELECT image FROM symptom_notes WHERE id=?", (int(req.path_params["sid"]),))
    if not r or not r[0][0]:
        return Response(status_code=404)
    return Response(r[0][0], media_type="image/jpeg")


async def sup_speech(req):
    b = await req.json()
    items = supplies.parse_spoken(b.get("text", ""))
    return J({"items": items, "note": "" if items else "No items recognised. Say a name and a quantity, e.g. ‘ibuprofen 60 tablets’."})


async def ppg(req):
    b = await req.json()
    return J(SV.ppg(b.get("t", []), b.get("r", [])))


async def skin(req):
    c = crew_or_404(req.path_params["cid"])
    form = await req.form()
    data = await form["file"].read()
    ei = SV.skin_index(data)
    base = c.d.get("eryBase")
    val = 100.0 if base is None else 100 * (1 + (ei - base) / max(10, abs(base)))
    if form.get("save") == "1":
        if base is None or form.get("baseline") == "1":
            c.d["eryBase"] = ei
            store.save_crew(c)
        c.add("ery", c.now_day(), val, "c")
    st = c.status_value("ery", val, c.now_day())
    return J({"ei": ei, "value": val, "first": base is None, "lvl": st["lvl"], "why": st["why"]})


async def wear_import(req):
    c = crew_or_404(req.path_params["cid"])
    b = await req.json()
    try:
        rows = SV.parse_wearable(b.get("text", ""))
    except Exception:
        return err("Could not read that file")
    t0 = datetime.fromisoformat(c.d["launch"].replace("Z", "+00:00")).timestamp()
    ok = bad = 0
    days = set()
    for m, v, t in rows:
        vid = SV.map_metric(m)
        try:
            val = float(v)
        except (TypeError, ValueError):
            vid = None
        if not vid:
            bad += 1
            continue
        d = c.now_day()
        if t not in (None, ""):
            try:
                d = float(t)
            except ValueError:
                try:
                    d = (datetime.fromisoformat(str(t)).replace(tzinfo=timezone.utc).timestamp() - t0) / 86400
                except ValueError:
                    pass
        c.add(vid, d, val, "i", derive=False)
        days.add(round(d, 4))
        ok += 1
    for d in days:
        c.derive(d)
    return J({"ok": ok, "bad": bad})


# ------------------------------------------------------------------ assessment
async def assess(req):
    c = crew_or_404(req.path_params["cid"])
    b = await req.json()
    d = c.now_day()
    got = []
    sim = bool(b.get("simulate"))
    values = b.get("values") or {}
    if sim:
        values = SV.simulate_panel(c, d, b.get("panels") or [], b.get("scenario", "typical"))
    before = {r[0] for r in c.recs}
    for k, v in values.items():
        if k in RF.VM and v not in (None, ""):
            if c.add(k, d, v, "s" if sim else "a", derive=False):
                got.append(k)
    if got:
        c.derive(d)
    conds = [cond_json(c, k["id"], d, "assess", True) for k in RF.CONDS]
    conds.sort(key=lambda x: -(x["lvl"] if x["lvl"] is not None else -1))
    top = max([x["lvl"] for x in conds if x["lvl"] is not None] or [0])
    A = [x["short"] for x in conds if x["lvl"] == 2]
    W = [x["short"] for x in conds if x["lvl"] == 1]
    verdict = (f"Alert in {', '.join(A)}. Follow the steps below and send this report to the flight surgeon at the next communication window ({c.comm_delay(d)})."
               if top == 2 else f"Warning: {', '.join(W)}. Apply the countermeasures and re-test as scheduled." if top == 1
               else "All assessed systems are within your expected in-flight range.")
    calc = []
    for v in RF.VARS:
        if v["f"] == "calc":
            r = c.latest(v["id"], d, 0.01)
            if r and abs(r[2] - d) < 0.01:
                _, st = c.status_latest(v["id"], d)
                calc.append({"v": v["id"], "n": v["n"], "u": v["u"], "value": r[3], "lvl": st["lvl"], "dp": v.get("dp", 1)})
    lines = [f"VITALS IN THE VOID ASSESSMENT — {c.d['name']} ({c.d.get('role', '')}) — mission day {d:.1f} — {RF.ENVS[c.env_at(d)]['n']}",
             f"VERDICT: {LV[top].upper()} — {verdict}"]
    for x in conds:
        if x.get("items"):
            lines.append(f"\n[{LV[x['lvl']]}] {x['n']}")
            for i in x["items"]:
                lines.append(f"  {i['n']}: {fmt(i['value'], i['dp'])} {i['u']} (expected {fmt(i['E'], i['dp'])}) {LV[i['lvl']]}" + (f" — {i['why']}; {i['note']}" if i["lvl"] else ""))
            if x["sym"]:
                lines.append("  Symptoms: " + ", ".join(x["sym"]))
    if sim:  # simulated run: show the full working, then remove the simulated values so real records stay clean
        for r in [r for r in list(c.recs) if r[0] not in before]:
            c.delete(r[0])
        lines.insert(0, "*** SIMULATED DATA — demonstration only, not saved ***")
    return J({"saved": [] if sim else got, "simulated": values if sim else None, "top": top, "verdict": verdict, "conds": conds, "calc": calc,
              "text": "\n".join(lines), "hdr": header(c), "ai_explain": AI.explain_status({"conds": conds})})


async def plan_ep(req):
    from .plans import build_plan
    c = crew_or_404(req.path_params["cid"])
    return J(build_plan(c, supplies))


# ------------------------------------------------------------------ EVA readiness
async def eva_ready(req):
    c = crew_or_404(req.path_params["cid"])
    d = c.now_day()
    chk = []

    def add(t, ok, sev, detail):
        chk.append({"t": t, "ok": ok, "sev": sev, "detail": detail})
    r = c.latest("sleep", d, 1.5)
    add("Slept at least 6 h last night", bool(r and r[3] >= 6), "caution", f"{fmt(r[3], 1)} h" if r else "No sleep log")
    r, st = c.status_latest("pvt", d, 8)
    add("Reaction time within your range", bool(r and st["lvl"] == 0), "caution", f"{fmt(r[3], 0)} ms" if r else "No recent reaction test")
    last = max([x[2] for x in c.recs if x[1].startswith("eva_")] or [None]) if any(x[1].startswith("eva_") for x in c.recs) else None
    rest = (d - last) if last is not None else None
    add("At least 4 rest days since the last EVA", rest is None or rest >= 4, "caution", "No previous EVA" if rest is None else f"{rest:.1f} d")
    for vid, t in (("eva_hand", "Hand pain from last EVA below 3/10"), ("eva_shoulder", "Shoulder pain below 3/10")):
        r = c.latest(vid, d, 30)
        add(t, not r or r[3] < 3, "nogo" if r and r[3] >= 7 else "caution", f"{fmt(r[3], 0)}/10" if r else "None reported")
    r = c.latest("eva_nail", d, 30)
    add("No fingernail lifting", not r or r[3] < 0.5, "caution", "Nail lifting reported" if r and r[3] >= 0.5 else "None")
    dcs = [x for x in c.of_var("eva_dcs") if d - 30 <= x[2] <= d and x[3] > 0]
    add("No decompression sickness in the last 30 days", not dcs, "nogo", "DCS reported — flight surgeon clearance needed" if dcs else "None")
    cong = any(x[1] in ("sym_congest", "sym_fever") for x in c.symptoms_recent(d))
    add("No congestion or fever (ear/sinus squeeze, illness)", not cong, "nogo", "Symptom logged in last 3 days" if cong else "None")
    for vid, t in (("hr", "Resting heart rate nominal"), ("sbp", "Blood pressure nominal"), ("ctemp", "No fever"), ("spo2", "Oxygen saturation nominal")):
        r, st = c.status_latest(vid, d, 2)
        add(t, bool(r and st["lvl"] == 0), "nogo" if r and st["lvl"] == 2 else "caution", f"{fmt(r[3], RF.VM[vid].get('dp', 1))} {RF.VM[vid]['u']}" if r else "No recent reading")
    r = c.latest("usg", d, 1.5)
    add("Hydrated (urine SG under 1.025)", bool(r and r[3] < 1.025), "caution", fmt(r[3], 3) if r else "No reading")
    r, st = c.status_latest("force", d, 21)
    add("Strength not in Alert", not (r and st["lvl"] == 2), "caution", f"{fmt(r[3], 0)} % preflight" if r else "No recent test")
    hand = c.d.get("hand")
    try:
        big = float(hand) > 22.86
    except (TypeError, ValueError):
        big = False
    add("Glove injury risk (hand circumference)", not big, "caution", f"{hand} cm: above 22.86 cm, fingernail injury risk ~20 % vs ~6 % — use liners and a fit check" if big else (f"{hand} cm" if hand else "Not recorded"))
    hrs = sum(x[3] for x in c.of_var("eva_hours7") if d - 7 <= x[2] <= d)
    add("EVA hours this week under 24", hrs < 24, "caution", f"{hrs:.1f} h logged")
    nogo = [x for x in chk if not x["ok"] and x["sev"] == "nogo"]
    caut = [x for x in chk if not x["ok"] and x["sev"] == "caution"]
    verdict = "No-go" if nogo else "Go with caution" if caut else "Go"
    evas = sorted({round(x[2], 2) for x in c.recs if x[1].startswith("eva_")}, reverse=True)
    return J({"verdict": verdict, "checks": chk, "evas": evas, "refs": [RF.REFS[r] for r in RF.CM["eva"]["ref"]]})


# ------------------------------------------------------------------ routine
async def routine(req):
    c = crew_or_404(req.path_params["cid"])
    d = c.now_day()
    jd = journal.entry_days(c.id)
    tasks = [{**t, "done": c.task_done(t, d, jd)} for t in RF.TASKS]
    board = []
    for k in store.crew.values():
        g = k.game(k.now_day(), journal.entry_days(k.id))
        board.append({"name": k.d["name"], "level": g["level"], "streak": g["streak"], "xp": g["xp"]})
    return J({"tasks": tasks, "game": c.game(d, jd), "board": board, "day": d})


# ------------------------------------------------------------------ supplies
async def sup_list(req):
    rem = supplies.remaining_days()
    return J({"items": supplies.summary(), "struct": supplies.struct(), "lead": supplies.lead_time(), "lead_set": store.settings.get("lead"), "margin": store.settings.get("margin") or 14,
              "remaining": rem, "mission": (supplies.mission().d.get("mission") if supplies.mission() else None)})


async def sup_save(req):
    b = await req.json()
    return J(supplies.save(b))


async def sup_delete(req):
    supplies.delete(req.path_params["iid"])
    return J({"ok": True})


async def sup_log(req):
    b = await req.json()
    it = supplies.log(req.path_params["iid"], float(b.get("delta", 0)), b.get("reason", ""), b.get("crew"))
    return J(it or {"error": "not found"})


async def sup_hist(req):
    return J(supplies.history(req.path_params["iid"]))


async def sup_upload(req):
    form = await req.form()
    f = form["file"]
    data = await f.read()
    ai = AI.extract_supplies(f.filename, data)
    res = {"items": ai, "note": "Read by AI"} if ai else supplies.parse_upload(f.filename, data)
    return J(res)


async def sup_bulk(req):
    b = await req.json()
    n = 0
    for it in b.get("items", []):
        if it.get("name"):
            supplies.save({k: it.get(k) for k in ("name", "kind", "sub", "qty", "unit", "rate", "expiry", "tags", "shelf_name", "cat_name", "shelf", "cat")})
            n += 1
    return J({"saved": n})


async def sup_struct(req):
    b = await req.json()
    return J(supplies.struct_op(b.get("op"), b))


async def sup_order(req):
    b = await req.json()
    iid = req.path_params["iid"]
    act = b.get("action", "order")
    it = supplies.order(iid, b.get("qty"), b.get("eta_days")) if act == "order" else supplies.received(iid) if act == "received" else supplies.cancel_order(iid)
    return J(it or {"error": "not found"})


async def sup_starter(req):
    if supplies.items():
        return err("Inventory already has items")
    for it in starter_inventory(max(1, len(store.crew))):
        supplies.save(it)
    return J({"ok": True})


# ------------------------------------------------------------------ journal
def _tok(req):
    return req.headers.get("x-journal-token", "")


async def j_status(req):
    cid = req.path_params["cid"]
    return J({"has_password": journal.has_password(cid), "prompts": PROMPTS})


async def j_setpw(req):
    b = await req.json()
    try:
        return J({"token": journal.set_password(req.path_params["cid"], b.get("password", ""))})
    except ValueError as e:
        return err(str(e))


async def j_unlock(req):
    b = await req.json()
    try:
        return J({"token": journal.unlock(req.path_params["cid"], b.get("password", ""))})
    except ValueError as e:
        return err(str(e), 401)


async def j_entries(req):
    try:
        return J(journal.entries(req.path_params["cid"], _tok(req)))
    except PermissionError as e:
        return err(str(e), 401)


async def j_add(req):
    b = await req.json()
    cid = req.path_params["cid"]
    try:
        c = store.crew.get(cid)
        journal.add(cid, _tok(req), b.get("text", ""), c.now_day() if c else None)
        return J({"ok": True})
    except PermissionError as e:
        return err(str(e), 401)
    except ValueError as e:
        return err(str(e))


async def j_delete(req):
    try:
        journal.delete(req.path_params["cid"], _tok(req), int(req.path_params["eid"]))
        return J({"ok": True})
    except PermissionError as e:
        return err(str(e), 401)


async def j_lock(req):
    journal.lock(_tok(req))
    return J({"ok": True})


async def j_change(req):
    b = await req.json()
    try:
        journal.change_password(req.path_params["cid"], b.get("old", ""), b.get("new", ""))
        return J({"ok": True})
    except ValueError as e:
        return err(str(e), 400)


# ------------------------------------------------------------------ rash
async def rash_check(req):
    c = crew_or_404(req.path_params["cid"])
    form = await req.form()
    answers = json.loads(form.get("answers") or "{}")
    notes = json.loads(form.get("notes") or "{}")
    data = None
    img = None
    if "file" in form and hasattr(form["file"], "read"):
        data = await form["file"].read()
        if data:
            prev = store.db.q("SELECT data FROM rash WHERE crew_id=? AND image IS NOT NULL ORDER BY id DESC LIMIT 1", (c.id,))
            pimg = json.loads(prev[0][0]).get("img") if prev else None
            try:
                img = RASH.analyse_image(data, pimg)
            except Exception:
                img = {"quality": ["Could not read this image"]}
    res = RASH.assess(answers, img, notes)
    ai = AI.classify_rash_image(data, answers) if data else None
    for r in res["ranked"]:
        r["supplies"] = supplies.for_tags(r["sup"])
        r["refs"] = [RF.REFS[x] for x in r["ref"] if x in RF.REFS]
    out = {**res, "img": img, "ai": ai, "day": c.now_day()}
    rid = store.db.x("INSERT INTO rash (crew_id, day, ts, data, image) VALUES (?,?,?,?,?)",
                     (c.id, c.now_day(), datetime.now(timezone.utc).isoformat(), json.dumps({"answers": answers, "notes": notes, "img": img, "top": [r["n"] for r in res["ranked"]], "flags": [f["t"] for f in res["flags"]], "status": "active"}), data))
    if res["flags"] or res["ranked"]:
        c.add("sym_rash", c.now_day(), 1, "m", derive=False)
    out["id"] = rid
    return J(out)


async def rash_hist(req):
    rows = store.db.q("SELECT id, day, ts, data, image IS NOT NULL FROM rash WHERE crew_id=? ORDER BY id DESC", (req.path_params["cid"],))
    return J([{"id": i, "day": d, "ts": ts, **json.loads(x), "has_img": bool(h)} for i, d, ts, x, h in rows])


async def rash_clear(req):
    rid = int(req.path_params["rid"])
    b = await req.json()
    r = store.db.q("SELECT crew_id, data FROM rash WHERE id=?", (rid,))
    if not r:
        return err("Not found", 404)
    cid, data = r[0]
    d = json.loads(data)
    c = store.crew.get(cid)
    if b.get("undo"):
        d.update(status="active")
        d.pop("cleared_day", None)
        d.pop("cleared_note", None)
    else:
        d.update(status="cleared", cleared_day=c.now_day() if c else None, cleared_note=b.get("note", ""),
                 cleared_ts=datetime.now(timezone.utc).isoformat())
    store.db.x("UPDATE rash SET data=? WHERE id=?", (json.dumps(d), rid))
    return J({"ok": True, "status": d["status"]})


async def rash_img(req):
    r = store.db.q("SELECT image FROM rash WHERE id=?", (int(req.path_params["rid"]),))
    if not r or not r[0][0]:
        return Response(status_code=404)
    return Response(r[0][0], media_type="image/jpeg")


# ------------------------------------------------------------------ export / import
async def export(req):
    data = {"app": "Vitals in the Void", "version": 2, "exported": datetime.now(timezone.utc).isoformat(), "settings": store.settings,
            "crew": [c.d for c in store.crew.values()], "records": {cid: r for cid, r in store.recs.items()}, "supplies": supplies.items(),
            "note": "Journal entries are excluded (they stay encrypted on this device)."}
    return Response(json.dumps(data), media_type="application/json", headers={"Content-Disposition": "attachment; filename=vitals_of_the_void_export.json"})


async def wipe(req):
    for cid in list(store.crew):
        store.delete_crew(cid)
    for it in supplies.items():
        supplies.delete(it["id"])
    store.settings.update({"clock": None, "onboarded": False, "streams": {}})
    store.save_settings()
    return J({"ok": True})


async def index(req):
    return FileResponse(FRONT / "index.html")


def wrap(fn):
    async def inner(req):
        try:
            return await fn(req)
        except KeyError as e:
            return err(f"Not found: {e}", 404)
    return inner


R = lambda p, f, m=("GET",): Route(p, wrap(f), methods=list(m))
routes = [
    Route("/", index), Route("/favicon.ico", lambda r: Response(status_code=204)), R("/api/meta", meta), R("/api/state", state), R("/api/settings", settings, ["POST"]),
    R("/api/crew", crew_save, ["POST"]), R("/api/crew/{cid}", crew_delete, ["DELETE"]), R("/api/sample", sample, ["POST"]),
    R("/api/crew/{cid}/baselines", baselines_get), R("/api/crew/{cid}/baselines", baselines_save, ["POST"]), R("/api/baselines/upload", baselines_upload, ["POST"]),
    R("/api/crew/{cid}/overview", overview), R("/api/crew/{cid}/condition/{kid}", condition), R("/api/crew/{cid}/region/{rid}", region),
    R("/api/crew/{cid}/var/{vid}", var_detail), R("/api/crew/{cid}/records", records_add, ["POST"]), R("/api/records/{rid}", record_delete, ["DELETE"]), R("/api/records-delete", records_delete_many, ["POST"]),
    R("/api/parse", parse, ["POST"]), R("/api/alerts", alerts), R("/api/crew/{cid}/live", live_get), R("/api/crew/{cid}/stream", stream_set, ["POST"]),
    R("/api/extract", extract, ["POST"]), R("/api/crew/{cid}/wearable", wearable_get), R("/api/crew/{cid}/battery", battery_post, ["POST"]), R("/api/crew/{cid}/uplink", uplink_post, ["POST"]), R("/api/wearable-events", wearable_events), R("/api/crew/{cid}/drift", drift_post, ["POST"]), R("/api/appearance", appearance_get), R("/api/appearance", appearance_post, ["POST"]), R("/api/wallpaper", wallpaper_upload, ["POST"]), R("/api/wallpaper/file", wallpaper_file), R("/api/emergency", emergency_get), R("/api/emergency", emergency_post, ["POST"]), R("/api/emergency/resolve", emergency_resolve, ["POST"]), R("/api/crew/{cid}/symptoms", symptom_report, ["POST"]), R("/api/crew/{cid}/symptoms", symptom_list),
    R("/api/symptom-image/{sid}", symptom_img), R("/api/supplies-speech", sup_speech, ["POST"]), R("/api/ppg", ppg, ["POST"]), R("/api/crew/{cid}/skin", skin, ["POST"]),
    R("/api/crew/{cid}/import", wear_import, ["POST"]), R("/api/crew/{cid}/assess", assess, ["POST"]), R("/api/crew/{cid}/eva", eva_ready),
    R("/api/crew/{cid}/routine", routine),
    R("/api/supplies", sup_list), R("/api/supplies", sup_save, ["POST"]), R("/api/supplies/{iid}", sup_delete, ["DELETE"]),
    R("/api/supplies/{iid}/log", sup_log, ["POST"]), R("/api/supplies/{iid}/history", sup_hist), R("/api/supplies-upload", sup_upload, ["POST"]),
    R("/api/supplies-bulk", sup_bulk, ["POST"]), R("/api/supplies-struct", sup_struct, ["POST"]), R("/api/supplies/{iid}/order", sup_order, ["POST"]), R("/api/supplies-starter", sup_starter, ["POST"]),
    R("/api/journal/{cid}", j_status), R("/api/journal/{cid}/password", j_setpw, ["POST"]), R("/api/journal/{cid}/unlock", j_unlock, ["POST"]),
    R("/api/journal/{cid}/entries", j_entries), R("/api/journal/{cid}/entries", j_add, ["POST"]), R("/api/journal/{cid}/entries/{eid}", j_delete, ["DELETE"]),
    R("/api/journal/{cid}/lock", j_lock, ["POST"]), R("/api/journal/{cid}/change", j_change, ["POST"]),
    R("/api/crew/{cid}/rash", rash_check, ["POST"]), R("/api/crew/{cid}/rash", rash_hist), R("/api/rash-image/{rid}", rash_img), R("/api/rash/{rid}/clear", rash_clear, ["POST"]),
    R("/api/crew/{cid}/plan", plan_ep),
    R("/api/export", export), R("/api/wipe", wipe, ["POST"]),
    Mount("/static", StaticFiles(directory=str(FRONT)), name="static"),
]
@contextlib.asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(stream_loop())
    yield
    task.cancel()


app = Starlette(routes=routes, lifespan=lifespan)
