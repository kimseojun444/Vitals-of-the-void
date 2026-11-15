"""Health model: personal adaptation trajectory, graded and persistence-based status, formulas, personalisation, routine.

Status levels (per reading):
  0 Nominal  – within the astronaut's expected range (≤ 2 σ of the personal trajectory, inside clinical limits)
  1 Warning  – mildly off (2–3 σ), moderately off (> 3 σ or past a clinical limit), or trending away from the trajectory
  2 Alert    – immediately when dangerous (past a safety limit, > 5 σ, dose-rate spike), or when a Warning
               persists for several consecutive readings without recovering.
"""
import json
import math
import random
import time
import uuid
from datetime import datetime, timezone

from . import reference as RF
from .db import DB

DAY = 86400.0
LV = ["Nominal", "Warning", "Alert"]
AGE = {"cont": 1.5, "daily": 2.5, "d2": 3.5, "d3": 5, "weekly": 30, "biweekly": 30, "calc": 14, "eva": 14}
# persistence: readings needed (mild, moderate) and minimum time span (days) before a Warning becomes an Alert
PERSIST = {"cont": (4, 3, 1 / 24), "daily": (3, 2, 0.9), "d2": (2, 2, 0), "d3": (2, 2, 0), "weekly": (2, 2, 0), "biweekly": (2, 2, 0), "calc": (2, 2, 0), "eva": (2, 2, 0)}
SRC = {"w": "Wearable", "m": "Manual", "v": "Voice", "c": "Camera", "a": "Assessment", "f": "Formula", "d": "Sample data", "i": "Import", "s": "Simulated"}


def clamp(x, a, b):
    return max(a, min(b, x))


def fmt(x, dp=1):
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return "–"
    return f"{x:.{dp}f}"


class Store:
    def __init__(self, db: DB):
        self.db = db
        self.crew = {}
        self.recs = {}
        for cid, data in db.q("SELECT id, data FROM crew"):
            self.crew[cid] = Crew(self, json.loads(data))
        for rid, cid, var, day, val, src in db.q("SELECT id, crew_id, var, day, value, src FROM records ORDER BY day"):
            self.recs.setdefault(cid, []).append([rid, var, day, val, src])
        self.bulk, self.bulk_id = None, 0
        self.settings = db.get("settings", {"avatar": None, "clock": None, "k2": 0.35, "lead": None})

    def save_settings(self):
        self.db.put("settings", self.settings)

    def save_crew(self, c):
        self.db.x("INSERT OR REPLACE INTO crew VALUES (?,?)", (c.id, json.dumps(c.d)))
        c.reset()

    def delete_crew(self, cid):
        self.db.x("DELETE FROM crew WHERE id=?", (cid,))
        self.db.x("DELETE FROM records WHERE crew_id=?", (cid,))
        self.crew.pop(cid, None)
        self.recs.pop(cid, None)

    def records(self, cid):
        return self.recs.setdefault(cid, [])



class Crew:
    def __init__(self, store, d):
        self.s = store
        self.d = d
        self.id = d["id"]
        self.reset()

    def reset(self):
        self._vc = {}
        self._c = {}
        self._u = None

    # ---------- basic helpers
    @property
    def recs(self):
        return self.s.records(self.id)

    def B(self, vid):
        v = (self.d.get("base") or {}).get(vid)
        return float(v) if v not in (None, "") else RF.VM[vid]["b"]

    def now_day(self):
        if self.s.settings.get("clock") is not None:
            return float(self.s.settings["clock"])
        t0 = datetime.fromisoformat(self.d["launch"].replace("Z", "+00:00")).timestamp()
        return (time.time() - t0) / DAY

    def date_of(self, day):
        t0 = datetime.fromisoformat(self.d["launch"].replace("Z", "+00:00")).timestamp()
        return datetime.fromtimestamp(t0 + day * DAY, tz=timezone.utc)

    def phases(self):
        t, out = 0, []
        for e, n in RF.MISSIONS.get(self.d.get("mission", "iss"), RF.MISSIONS["iss"])["ph"]:
            out.append({"e": e, "s": t, "end": t + n})
            t += n
        return out

    def env_at(self, d):
        if d < 0:
            return "earth"
        for p in self.phases():
            if d < p["end"]:
                return p["e"]
        return "earth"

    def series(self):
        if self._u:
            return self._u
        U, X, ph = [], [], self.phases()
        n = int(ph[-1]["end"]) + 400
        u = x = 0.0
        k = 1 - math.exp(-1 / 4)
        for d in range(n + 1):
            e = RF.ENVS[self.env_at(d)]
            tu, tx = 1 - e["g"], (0 if e["g"] == 1 else 1)
            if d == 0:
                u, x = tu, tx
            else:
                u += (tu - u) * k
                x += (tx - x) * k
            U.append(u)
            X.append(x)
        self._u = (U, X)
        return self._u

    def lims(self, vid):
        out = {}
        for k in ("wl", "wh", "cl", "ch"):
            s = RF.VM[vid].get("lim", {}).get(k)
            if s is None:
                out[k] = None
            elif isinstance(s, (int, float)):
                out[k] = float(s)
            else:  # 'b*0.8', 'b+55', 'b-5'
                b, op, x = self.B(vid), s[1], float(s[2:])
                out[k] = b * x if op == "*" else b + x if op == "+" else b - x
        return out

    # ---------- adaptation trajectory
    @staticmethod
    def spec(s, b):
        if not s:
            return 0.0
        if isinstance(s, (int, float)):
            return float(s)
        x = float(s[1:])
        return b * x if s[0] == "r" else x

    @staticmethod
    def delta_at(v, b, d, A):
        """Smooth hand-over from the <30 d value to the >30 d value (logistic centred on 30·A days)."""
        if d <= 0:
            return 0.0
        on = 1 - math.exp(-d / (v["on"] * A))
        w = 1 / (1 + math.exp(-(d - 30 * A) / (5 * A)))
        S0 = Crew.spec(v["s"], b)
        L = Crew.spec(v["l"], b)
        if v.get("pg"):
            L = S0 + (L - S0) * clamp((d - 30) / (v["pg"] - 30), 0, 1)
        if v.get("pr"):
            L += b * v["pr"] * d / 30
        return on * ((1 - w) * S0 + w * L)

    def expected(self, vid, d, A=None, rho=None):
        v = RF.VM[vid]
        if v["f"] == "calc":
            fx = RF.FX.get(RF.FX_BY_VAR.get(vid))
            if not fx:
                return self.B(vid)
            g = lambda k: self.cum_dose_exp(d) if k == "@dose" else (self.expected(k, d, A, rho) if k in RF.VM else None)
            try:
                r = fx(g, self.B, self.s.settings)
                return r if math.isfinite(r) else self.B(vid)
            except Exception:
                return self.B(vid)
        if v.get("env"):
            return RF.ENVS[self.env_at(d)]["dose"]
        b = self.B(vid)
        A = self.adapt_A() if A is None else A
        rho = self.rho(vid) if rho is None else rho
        U, X = self.series()
        arr = U if v.get("gs", 1) else X
        u = arr[int(clamp(math.floor(d), 0, len(arr) - 1))]
        return b + rho * u * self.delta_at(v, b, d, A)

    def tol(self, vid, d):
        v = RF.VM[vid]
        return max(0.3 * self.expected(vid, d), 0.05) if v.get("env") else v["tol"]

    # ---------- records
    def of_var(self, vid):
        if vid not in self._vc:
            self._vc[vid] = [r for r in self.recs if r[1] == vid]
        return self._vc[vid]

    def latest(self, vid, d, max_age=None):
        for r in reversed(self.of_var(vid)):
            if r[2] <= d + 1e-6:
                return r if (max_age is None or d - r[2] <= max_age) else None
        return None

    def add(self, vid, day, val, src, derive=True):
        if val is None:
            return None
        try:
            val = float(val)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(val):
            return None
        day = round(float(day), 4)
        if self.s.bulk is not None:  # bulk mode (sample generation): write later in one transaction
            self.s.bulk_id -= 1
            rid = self.s.bulk_id
            self.s.bulk.append((rid, self.id, vid, day, round(val, 4), src))
        else:
            rid = self.s.db.x("INSERT INTO records (crew_id,var,day,value,src) VALUES (?,?,?,?,?)", (self.id, vid, day, round(val, 4), src))
        r = [rid, vid, day, round(val, 4), src]
        a = self.recs
        i = len(a)
        while i > 0 and a[i - 1][2] > day:
            i -= 1
        a.insert(i, r)
        self._vc.pop(vid, None)
        self._c = {}
        if derive and vid in RF.VM and RF.VM[vid]["f"] != "calc":
            self.derive(day)
        return r

    def delete(self, rid):
        for r in self.recs:
            if r[0] == rid:
                self.recs.remove(r)
                if rid < 0 and self.s.bulk is not None:
                    self.s.bulk = [b for b in self.s.bulk if b[0] != rid]
                else:
                    self.s.db.x("DELETE FROM records WHERE id=?", (rid,))
                self._vc.pop(r[1], None)
                self._c = {}
                return r
        return None

    def cum_dose(self, d):
        k = ("cd", int(d))
        if k in self._c:
            return self._c[k]
        m = {}
        for r in self.of_var("dose"):
            m.setdefault(int(math.floor(r[2])), []).append(r[3])
        s = sum((sum(m[i]) / len(m[i])) if i in m else RF.ENVS[self.env_at(i)]["dose"] for i in range(int(math.floor(d))))
        self._c[k] = s
        return s

    def cum_dose_exp(self, d):
        return sum(RF.ENVS[self.env_at(i)]["dose"] for i in range(int(math.floor(d))))

    def dose30(self, d):
        return self.cum_dose(d) - self.cum_dose(max(0, d - 30))

    # ---------- formulas (the team's 11 + sheet-1 indices)
    def derive(self, d):
        def g(k):
            if k == "@dose":
                return self.cum_dose(d)
            for x in k.split("|"):
                r = self.latest(x, d, 14)
                if r:
                    return r[3]
            return None
        for key, fx in RF.FX.items():
            meta = RF.FXT[key]
            ins = meta["in"]
            if any(g(k) is None for k in ins):
                continue
            fresh = any(k != "@dose" and any((lambda r: r and abs(r[2] - d) < 0.01)(self.latest(x, d, 0.01)) for x in k.split("|")) for k in ins)
            if not fresh and ins != ["@dose"]:
                continue
            if meta["v"] == "ery" and any(abs(r[2] - d) < 0.6 for r in self.of_var("ery")):
                continue
            try:
                val = fx(lambda k: g(k), self.B, self.s.settings)
            except Exception:
                val = None
            if val is not None and math.isfinite(val):
                old = next((r for r in self.of_var(meta["v"]) if r[4] == "f" and abs(r[2] - d) < 0.01), None)
                if old:
                    self.delete(old[0])
                self.add(meta["v"], d, val, "f", derive=False)

    # ---------- personalisation
    def rho(self, vid):
        """How strongly this astronaut responds compared with the population change (shrunk toward 1 until ~8 readings)."""
        k = ("rho", vid)
        if k in self._c:
            return self._c[k]
        v = RF.VM[vid]
        if v["f"] == "calc" or v.get("env") or v["f"] == "eva":
            self._c[k] = 1.0
            return 1.0
        b, A, L, rs = self.B(vid), self.adapt_A(), self.lims(vid), []
        for r in self.of_var(vid):
            if r[2] < 3:
                continue
            D = self.expected(vid, r[2], A, 1.0) - b
            if abs(D) < 0.5 * v["tol"]:
                continue
            if (L["cl"] is not None and r[3] < L["cl"]) or (L["ch"] is not None and r[3] > L["ch"]):
                continue  # never learn from dangerous values
            rs.append((r[3] - b) / D)
        if not rs:
            self._c[k] = 1.0
            return 1.0
        rs.sort()
        med = rs[len(rs) // 2]
        w = len(rs) / (len(rs) + 8)
        self._c[k] = clamp(1 + w * (med - 1), 0.25, 2.5)
        return self._c[k]

    def rho_n(self, vid):
        return sum(1 for r in self.of_var(vid) if r[2] >= 3)

    def adapt_A(self):
        """Personal adaptation timing (1 = population average; < 1 adapts faster). Prior from profile, updated from days 4–75."""
        if "A" in self._c:
            return self._c["A"]
        A0 = float(self.d.get("A0") or 1)
        self._c["A"] = A0
        vs = [v for v in RF.VARS if v["f"] not in ("calc", "eva") and not v.get("env") and self.spec(v["s"], v["b"]) != self.spec(v["l"], v["b"])]
        pts = [(v["id"], r[2], r[3]) for v in vs for r in self.of_var(v["id"]) if 4 <= r[2] <= 75]
        if len(pts) < 12:
            return A0
        best, bs = A0, 1e18
        A = 0.6
        while A <= 1.65:
            s = sum(((x - self.expected(i, d, A, 1.0)) / RF.VM[i]["tol"]) ** 2 for i, d, x in pts)
            if s < bs:
                bs, best = s, A
            A += 0.05
        w = len(pts) / (len(pts) + 60)
        self._c["A"] = round(A0 + w * (best - A0), 3)
        return self._c["A"]

    # ---------- grading and status
    def grade(self, vid, x, d):
        """Grade one value: 0 normal, 1 mild, 2 moderate, 3 dangerous."""
        v = RF.VM[vid]
        E, tol, L = self.expected(vid, d), self.tol(vid, d), self.lims(vid)
        z = (x - E) / tol if tol else 0.0
        zd = max(0, z) if v["dir"] == "hi" else max(0, -z) if v["dir"] == "lo" else abs(z)
        dp = v.get("dp", 1)
        fl = lambda y: fmt(y, 0) if float(y).is_integer() else fmt(y, max(dp, 1))
        g, why = 0, "Within your expected range"
        if zd > 2:
            g = 1 if zd <= 3 else 2
            why = f"{abs(z):.1f} σ {'above' if z > 0 else 'below'} your expected {fmt(E, dp)} {v['u']}".strip()
        L0 = self.lims(vid)
        if zd > 5 and not any(L0[k] is not None for k in ("wl", "wh", "cl", "ch")):
            g = 3
            why = f"Far from your expected value ({abs(z):.1f} σ {'above' if z > 0 else 'below'} {fmt(E, dp)} {v['u']})"
        if v.get("env") and x > 5 * E:
            g, why = 3, "Dose rate over 5× expected: possible solar particle event"
        hiC = L["ch"] is not None and x > L["ch"]
        loC = L["cl"] is not None and x < L["cl"]
        hiW = L["wh"] is not None and x > L["wh"]
        loW = L["wl"] is not None and x < L["wl"]
        if hiC or loC:
            g, why = 3, f"Beyond the safety limit ({'> ' + fl(L['ch']) if hiC else '< ' + fl(L['cl'])} {v['u']})".replace("  ", " ")
        elif (hiW or loW) and g < 3:
            g = max(g, 2)
            why = f"Outside the clinical range ({'> ' + fl(L['wh']) if hiW else '< ' + fl(L['wl'])} {v['u']})".replace("  ", " ")
        exp_bad = (L["wh"] is not None and E > L["wh"]) or (L["wl"] is not None and E < L["wl"])
        direction = "hi" if x > E else "lo"
        return {"g": g, "z": z, "E": E, "tol": tol, "why": why, "expBad": exp_bad, "dir": direction}

    def status_series(self, vid):
        """Status of every reading of a variable, applying the persistence rule in time order."""
        k = ("ss", vid)
        if k in self._c:
            return self._c[k]
        out = []
        run = []  # consecutive off readings in the same direction
        f = RF.VM[vid]["f"]
        n1, n2, span = PERSIST.get(f, (2, 2, 0))
        for r in self.of_var(vid):
            gr = self.grade(vid, r[3], r[2])
            out.append(self._apply_persist(gr, r, run, n1, n2, span))
        self._c[k] = out
        return out

    def _apply_persist(self, gr, r, run, n1, n2, span):
        g = gr["g"]
        info = dict(gr)
        if g == 0:
            run.clear()
            info.update(lvl=0, n=0, need=0, recovering=False)
            return info
        if run and run[-1]["dir"] != gr["dir"]:
            run.clear()
        run.append({"dir": gr["dir"], "day": r[2], "z": abs(gr["z"]), "g": g})
        need = n2 if max(x["g"] for x in run) >= 2 else n1
        recovering = len(run) >= 2 and run[-1]["z"] < run[-2]["z"] - 0.5 and g < 3
        persisting = len(run) >= need and (run[-1]["day"] - run[0]["day"]) >= span
        if g == 3:
            lvl, note = 2, "Dangerous value: alert immediately"
        elif persisting and not recovering:
            lvl, note = 2, f"Off-range for {len(run)} readings in a row without recovering"
        else:
            lvl = 1
            dur = run[-1]["day"] - run[0]["day"]
            if recovering:
                note = "Recovering toward your expected range"
            elif len(run) >= need:
                fmt_t = lambda x: f"{x * 24 * 60:.0f} min" if x < 1 / 24 else f"{x * 24:.1f} h" if x < 1 else f"{x:.1f} d"
                note = f"Off-range for {fmt_t(dur)}; becomes an Alert if it lasts over {fmt_t(span)}"
            else:
                note = f"{len(run)} of {need} readings off-range; becomes an Alert if it persists"
        info.update(lvl=lvl, n=len(run), need=need, recovering=recovering, note=note)
        return info

    def status_latest(self, vid, d, max_age=None):
        a = self.of_var(vid)
        ss = self.status_series(vid)
        for i in range(len(a) - 1, -1, -1):
            if a[i][2] <= d + 1e-6:
                if max_age is not None and d - a[i][2] > max_age:
                    return None, None
                return a[i], ss[i]
        return None, None

    def status_value(self, vid, x, d):
        """Status for a new (not yet saved) value, e.g. a live wearable reading."""
        f = RF.VM[vid]["f"]
        n1, n2, span = PERSIST.get(f, (2, 2, 0))
        run = []
        for r, st in zip(self.of_var(vid), self.status_series(vid)):
            if r[2] > d:
                break
            if st["g"] == 0:
                run.clear()
            else:
                if run and run[-1]["dir"] != st["dir"]:
                    run.clear()
                run.append({"dir": st["dir"], "day": r[2], "z": abs(st["z"]), "g": st["g"]})
        if run and d - run[-1]["day"] > AGE.get(f, 14):
            run.clear()
        return self._apply_persist(self.grade(vid, x, d), [None, vid, d, x, "w"], run, n1, n2, span)

    def trend(self, vid, d):
        a = [r for r in self.of_var(vid) if d - 14 < r[2] <= d]
        if len(a) < 4:
            return None
        n = len(a)
        mx = sum(r[2] for r in a) / n
        my = sum(r[3] for r in a) / n
        sxx = sum((r[2] - mx) ** 2 for r in a)
        if not sxx:
            return None
        so = sum((r[2] - mx) * (r[3] - my) for r in a) / sxx
        se = (self.expected(vid, d) - self.expected(vid, d - 14)) / 14
        dev = (so - se) * 14 / self.tol(vid, d)
        v = RF.VM[vid]
        bad = dev > 1.5 if v["dir"] == "hi" else dev < -1.5 if v["dir"] == "lo" else abs(dev) > 1.5
        return {"dev": dev, "bad": bad}

    def symptoms_recent(self, d, days=3):
        return [r for r in self.recs if r[1].startswith("sym_") and d - days < r[2] <= d]

    def cond_status(self, cid, d, mode="monitor"):
        k = ("cs", cid, round(d, 3), mode)
        if k in self._c:
            return self._c[k]
        vs = [v for v in RF.VARS if cid in v["c"]]  # all variables: most recent invasive + non-invasive data
        items, lvl, missing = [], 0, 0
        for v in vs:
            age = 30 if v["inv"] else AGE.get(v["f"], 14)
            r, st = self.status_latest(v["id"], d, age)
            if not r:
                if v["f"] != "eva":
                    missing += 1
                continue
            t = self.trend(v["id"], d)
            L = st["lvl"]
            note = st.get("note", "")
            if t and t["bad"] and L < 1:
                L, note = 1, "Trending away from your trajectory"
            items.append({"v": v["id"], "r": r, "st": st, "lvl": L, "note": note, "trend": t})
            lvl = max(lvl, L)
        sy_ids = {r[1][4:] for r in self.symptoms_recent(d)}
        sy = [s for s in RF.SYMPTOMS if s[0] in sy_ids and cid in s[2]]
        for s in sy:
            lvl = max(lvl, 2 if (len(s) > 3 and s[3] == 2) else 1)
        flags = sum(1 for i in items if i["lvl"] > 0) + len(sy)
        combo = flags >= 3 and lvl < 2
        if combo:
            lvl = 2
        items.sort(key=lambda i: (-i["lvl"], -abs(i["st"]["z"])))
        res = {"lvl": lvl, "items": items, "missing": missing, "sym": sy, "total": len(vs), "combo": combo}
        self._c[k] = res
        return res

    def crew_index(self, d):
        if not any(self.cond_status(c["id"], d)["items"] for c in RF.CONDS):
            return None
        s = 100
        for c in RF.CONDS:
            st = self.cond_status(c["id"], d)
            s -= 18 if st["lvl"] == 2 else 6 if st["lvl"] == 1 else 0
        return max(0, s)

    def region_lvl(self, reg, d, mode):
        cs = [self.cond_status(k, d, mode) for k in RF.BODY[reg]["c"]]
        if not any(c["items"] or c["sym"] for c in cs):
            return None
        return max(c["lvl"] for c in cs)

    def phase_info(self, d):
        A = self.adapt_A()
        w = 1 / (1 + math.exp(-(d - 30 * A) / (5 * A)))
        if RF.ENVS[self.env_at(d)]["g"] == 1:
            return "Preflight" if d < 0 else "Post-flight re-adaptation"
        if w < 0.15:
            return "Early adaptation (< 30 d values)"
        if w < 0.85:
            return f"Transition to long-duration state ({round(w * 100)}%)"
        return "Long-duration state (> 30 d values)"

    def comm_delay(self, d):
        e = self.env_at(d)
        if e in ("leo", "earth"):
            return "Live link"
        if e == "moon":
            return "≈1.3 s one-way"
        return "≈4–24 min one-way" if self.d.get("mission") == "mars" else "≈1–2 s one-way"

    # ---------- routine & gamification
    def task_done(self, t, d, journal_days=()):
        frm = math.floor(d) if t["p"] == 1 else d - t["p"]
        if t["v"] == ["@journal"]:
            return any(frm <= j <= d + 1e-6 for j in journal_days)
        return any(r[1] in t["v"] and frm <= r[2] <= d + 1e-6 and (not t.get("min") or r[3] >= t["min"]) for r in self.recs)

    def game(self, d, journal_days=()):
        by_day = {}
        for r in self.recs:
            by_day.setdefault(int(math.floor(r[2])), set()).add(r[1] + ("+" if r[1] == "exer" and r[3] >= 90 else ""))
        for j in journal_days:
            by_day.setdefault(int(math.floor(j)), set()).add("@journal")
        xp, full = 0, {}
        daily = [t for t in RF.TASKS if t["p"] == 1]
        for i in range(0, int(math.floor(d)) + 1):
            s = by_day.get(i, set())
            ok_all = True
            for t in daily:
                ok = "exer+" in s if t["id"] == "ex" else any(v in s for v in t["v"])
                if ok:
                    xp += t["xp"]
                elif t["id"] != "jrn":
                    ok_all = False
            full[i] = ok_all
        for t in RF.TASKS:
            if t["p"] > 1:
                per = {int(r[2] // t["p"]) for r in self.recs if r[1] in t["v"]}
                xp += len(per) * t["xp"]
        streak, i = 0, int(math.floor(d))
        if not full.get(i):
            i -= 1
        while i >= 0 and full.get(i):
            streak += 1
            i -= 1
        cnt = lambda v: len(self.of_var(v))
        badges = [
            ["Full panel", "Completed a blood-draw assessment", cnt("ica") > 0],
            ["Iron legs", "Logged 90+ min exercise on 7 days", sum(1 for r in self.of_var("exer") if r[3] >= 90) >= 7],
            ["Eyes on the horizon", "4 weekly vision checks", cnt("amsler") + cnt("vis") >= 4],
            ["Quick draw", "Reaction test faster than your baseline", any(r[3] < self.B("pvt") for r in self.of_var("pvt"))],
            ["Hydro hero", "Urine SG under 1.020 on 7 days", sum(1 for r in self.of_var("usg") if r[3] < 1.02) >= 7],
            ["Dear diary", "7 private journal entries", len(journal_days) >= 7],
            ["Week streak", "7 days with every daily task done", streak >= 7],
            ["Month streak", "30-day streak", streak >= 30],
        ]
        level = int(math.sqrt(xp / 150)) + 1
        return {"xp": xp, "level": level, "streak": streak, "badges": badges, "lo": 150 * (level - 1) ** 2, "hi": 150 * level ** 2}


def new_crew_dict(**kw):
    d = {"id": uuid.uuid4().hex[:8], "name": "New astronaut", "role": "", "age": "", "sex": "", "weight": "", "hand": "",
         "mission": "iss", "launch": datetime.now(timezone.utc).isoformat(), "A0": 1, "base": {}}
    d.update(kw)
    return d
