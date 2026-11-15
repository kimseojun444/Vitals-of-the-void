"""Input processing (voice/text parsing, fingertip pulse, skin photo, wearable files), live wearable simulation, sample crew."""
import io
import json
import math
import random
import re
from datetime import datetime, timedelta, timezone

import numpy as np
from PIL import Image

from . import reference as RF
from .model import DAY, Crew, clamp, new_crew_dict

# ---------------------------------------------------------------- voice / text
EXTRA_ALIAS = [("oxygen left", "eva_o2end"), ("o2 left", "eva_o2end"), ("suit oxygen", "eva_o2end"), ("oxygen remaining", "eva_o2end"),
               ("suit co2", "eva_co2"), ("inspired co2", "eva_co2"), ("peak heart rate", "eva_hrpct"), ("suit temperature", "eva_temp"),
               ("peak temperature", "eva_temp"), ("hand pain", "eva_hand"), ("finger pain", "eva_hand"), ("shoulder pain", "eva_shoulder"),
               ("nail lifting", "eva_nail"), ("prebreathe", "eva_prebreathe"), ("eva hours", "eva_hours7"), ("rest days", "eva_rest"),
               ("decompression", "eva_dcs"), ("dcs", "eva_dcs")]
ALIAS = sorted([(a, v["id"]) for v in RF.VARS for a in v.get("al", [])] + [("slept", "sleep"), ("hours of sleep", "sleep"), ("bp", "sbp"), ("pressure", "sbp")] + EXTRA_ALIAS,
               key=lambda x: -len(x[0]))
SYMW = [("headache", "headache"), ("blur", "blur"), ("congest", "congest"), ("stuffy", "congest"), ("chest pain", "chest"), ("palpitation", "chest"),
        ("dizz", "dizzy"), ("faint", "dizzy"), ("nause", "nausea"), ("vomit", "nausea"), ("rash", "rash"), ("itch", "rash"), ("fever", "fever"),
        ("chill", "fever"), ("flank", "flank"), ("blood in urine", "flank"), ("back pain", "back"), ("back hurts", "back"), ("backache", "back"), ("back ache", "back"), ("sore back", "back"),
        ("headache", "headache"), ("head hurts", "headache"), ("can't see", "blur"), ("blurry", "blur"), ("throw up", "nausea"), ("sick to my stomach", "nausea"),
        ("exhausted", "fatigue"), ("out of breath", "breath"), ("hard to breathe", "breath"), ("pins and needles", "numb"), ("tingl", "numb"), ("tired", "fatigue"), ("fatigue", "fatigue"),
        ("short of breath", "breath"), ("breathless", "breath"), ("neck", "neck"), ("hopeless", "low"), ("feeling low", "low"), ("sad", "low"),
        ("joint pain", "joint"), ("mottl", "mottle"), ("numb", "numb"), ("nail", "nails"), ("shoulder", "shoulder")]


def _name_aliases():
    """Aliases from variable names so lab reports and speech using full names are understood ('Hemoglobin 14.2')."""
    out = []
    for v in RF.VARS:
        if v["f"] == "calc":
            continue
        n = v["n"].lower()
        base = re.sub(r"\s*\(.*?\)", "", n).strip()
        cands = {base, n}
        for inner in re.findall(r"\((.*?)\)", n):
            if len(inner) >= 3 and not re.search(r"\d|/", inner):
                cands.add(inner.strip())
        for pre in ("serum ", "urinary ", "total ", "peak ", "fasting ", "absolute "):
            if base.startswith(pre):
                cands.add(base[len(pre):])
        for a in cands:
            if len(a) >= 3:
                out.append((a, v["id"]))
    return out


ALIAS_ALL = sorted(set(ALIAS) | set(_name_aliases()), key=lambda x: -len(x[0]))


def parse_utterance(txt, scope=None):
    """Find 'name … number' pairs (speech, typed text, OCR or document text). scope = allowed variable ids."""
    out, sy = [], set()
    t = " " + re.sub(r"(\d),(\d)", r"\1.\2", (txt or "").lower()) + " "

    def bp(m):
        out.extend([("sbp", float(m.group(1))), ("dbp", float(m.group(2)))])
        return " ; "
    if not scope or "sbp" in scope:
        t = re.sub(r"(?:blood pressure|bp)\D{0,12}?(\d{2,3})\s*(?:over|/|by)\s*(\d{2,3})", bp, t)

    def sl(m):
        out.append(("sleep", float(m.group(1))))
        return " ; "
    if not scope or "sleep" in scope:
        t = re.sub(r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:of\s*)?sleep", sl, t)
    for a, vid in ALIAS_ALL:
        if scope and vid not in scope:
            continue
        def rep(m, vid=vid):
            if not any(o[0] == vid for o in out):
                out.append((vid, float(m.group(1))))
            return " ; "
        t = re.sub(r"\b" + re.escape(a) + r"\b[^\d;\n]{0,18}?(-?\d+(?:\.\d+)?)", rep, t)
    for w, k in SYMW:
        if w in t:
            sy.add(k)
    return {"vals": out, "sym": sorted(sy)}


# ---------------------------------------------------------------- fingertip pulse (signal sent from the browser)
def ppg(t, r):
    t, r = np.asarray(t, float), np.asarray(r, float)
    n = len(t)
    if n < 60 or t[-1] - t[0] < 6:
        return {"ok": False, "msg": "Too short: record at least 10 s."}
    dt = (t[-1] - t[0]) / n
    w = max(3, int(round(1 / dt)))
    k = np.ones(2 * w + 1) / (2 * w + 1)
    base = np.convolve(np.pad(r, w, mode="edge"), k, mode="valid")
    det = r - base
    sm = np.convolve(np.pad(det, 1, mode="edge"), np.ones(3) / 3, mode="valid")
    pk = []
    for i in range(1, n - 1):
        if sm[i] > 0 and sm[i] >= sm[i - 1] and sm[i] > sm[i + 1] and (not pk or t[i] - pk[-1] > 0.33):
            pk.append(t[i])
    if len(pk) < 4:
        return {"ok": False, "msg": "No clear pulse found. Cover lens and flash gently and hold still."}
    iv = np.diff(pk)
    mean = float(iv.mean())
    cv = float(iv.std() / mean)
    return {"ok": True, "hr": round(60 / mean), "beats": len(pk), "quality": "good" if cv < 0.12 else "fair" if cv < 0.25 else "poor",
            "wave": [round(float(x), 3) for x in sm[:: max(1, n // 300)]]}


# ---------------------------------------------------------------- skin photo erythema
def skin_index(data: bytes):
    img = Image.open(io.BytesIO(data)).convert("RGB")
    s = min(1.0, 400 / max(img.size))
    img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))))
    a = np.asarray(img).astype(float)
    h, w = a.shape[:2]
    c = a[h // 4: 3 * h // 4, w // 4: 3 * w // 4]
    R, G = c[..., 0], c[..., 1]
    m = (R > 15) & (G > 15)
    return float((100 * np.log10(R[m] / G[m])).mean()) if m.any() else 0.0


# ---------------------------------------------------------------- wearable / device file import
def parse_wearable(text):
    text = (text or "").strip()
    rows = []
    if not text:
        return rows
    if text[0] in "[{":
        j = json.loads(text)
        for o in (j if isinstance(j, list) else j.get("data", [])):
            rows.append((o.get("metric") or o.get("id") or o.get("type"), o.get("value"), o.get("time", o.get("day", o.get("date")))))
    else:
        for ln in text.splitlines():
            p = [x.strip() for x in re.split(r"[,;\t]", ln)]
            if len(p) >= 2 and p[0].lower() != "metric":
                rows.append((p[0], p[1], p[2] if len(p) > 2 else None))
    return rows


def map_metric(n):
    n = str(n or "").lower().strip()
    if n in RF.VM:
        return n
    for a, v in ALIAS:
        if a == n:
            return v
    for v in RF.VARS:
        if v["n"].lower() == n:
            return v["id"]
    return None


# ---------------------------------------------------------------- live wearable simulation
LIVEV = ["hr", "hrv", "spo2", "ctemp", "glu", "shift", "dose"]
NOISE = {"hr": 3, "hrv": 4, "spo2": 0.6, "ctemp": 0.08, "glu": 4, "shift": 0.05, "dose": 0.05}


def live_values(c: Crew, d, inject):
    out = {}
    for vid in LIVEV:
        E = c.expected(vid, d)
        x = E + random.gauss(0, 1) * (E * NOISE["dose"] if vid == "dose" else NOISE[vid])
        if inject == "hypox" and vid == "spo2":
            x = 88 + random.gauss(0, 1)
        if inject == "mild_hr" and vid == "hr":
            x = E + 2.4 * RF.VM["hr"]["tol"] + random.gauss(0, 1)
        if inject == "tachy" and vid == "hr":
            x = 138 + random.gauss(0, 3)
        if inject == "fever" and vid == "ctemp":
            x = 39.5
        if inject == "spe" and vid == "dose":
            x = E * 12
        out[vid] = round(x, RF.VM[vid].get("dp", 1) + 1)
    return out


# ---------------------------------------------------------------- sample crew (simulated, clearly marked)
def _seeded(seed):
    rnd = random.Random(seed)
    return rnd, (lambda: rnd.gauss(0, 1))


SAMPLE_NAMES = {"F": ["Aditi Rao", "Lena Okafor", "Mei Tanaka", "Sofia Lindqvist", "Amara Nwosu", "Priya Natarajan", "Hannah Becker", "Yasmin Haddad",
                      "Camila Reyes", "Ingrid Solberg", "Zara Ahmed", "Chloe Martin", "Ana Ivanova", "Nadia Kowalski", "Leila Farahani"],
                "M": ["Mateo Silva", "Kenji Watanabe", "Arjun Mehta", "Lucas Moreau", "Tomasz Nowak", "Daniel Osei", "Erik Johansson", "Omar Khalil",
                      "Rafael Duarte", "Viktor Petrov", "Samuel Adeyemi", "Jonas Weber", "Ravi Iyer", "Marco Bianchi", "Diego Fernández"]}
SAMPLE_ROLES = ["Commander", "Flight engineer", "Mission specialist", "Payload specialist", "Crew medical officer"]
# each sample astronaut gets a random health "story" so every loaded crew looks different
SAMPLE_STORIES = {
    "sans": lambda t, on: {"onsd": 0.012 * t, "trt": 0.5 * t, "vis": 0.012 * max(0, t - 10), "iop": 0.05 * max(0, t - 15)},
    "bone": lambda t, on: {"ctx": 0.25, "ntx": 25, "ucal": 95 if t > 10 else 0, "bmd": -0.012 * t},
    "sleep": lambda t, on: {"sleep": -1.1, "pvt": 45, "mood": -1.4 if t > 5 else 0, "stress": 1.5},
    "cardio": lambda t, on: {"hrv": -9 if t > 3 else -4, "hr": 6, "sbp": 7 if t > 6 else 0},
    "fluid": lambda t, on: {"usg": 0.008, "kcal": -350},
    "immune": lambda t, on: {"viral": 0.9, "ctemp": 0.25 if t < 6 else 0},
    "muscle": lambda t, on: {"force": -0.06 * t if t < 40 else -2.4, "lean": -0.03 * t if t < 40 else -1.2},
}


def make_sample_crew(store):
    """A new, different simulated crew every time: random people, mission, mission day, adaptation speed,
    individual baselines, health stories, spacewalks and a possible solar particle event."""
    seed = random.SystemRandom().randrange(1, 2 ** 31)
    rnd, gauss = _seeded(seed)
    mission = rnd.choice(["iss", "iss", "iss1y", "artemis", "mars"])
    mday = {"iss": (25, 170), "iss1y": (40, 300), "artemis": (8, 36), "mars": (30, 205)}[mission]
    day_now = round(rnd.uniform(*mday), 1)
    launch = (datetime.now(timezone.utc) - timedelta(days=day_now)).isoformat()
    n = rnd.choice([3, 3, 4])
    roles = SAMPLE_ROLES[:1] + rnd.sample(SAMPLE_ROLES[1:], n - 1)
    used, people = set(), []
    for k in range(n):
        sex = rnd.choice("FM")
        name = rnd.choice([x for x in SAMPLE_NAMES[sex] if x not in used]); used.add(name)
        w = round(rnd.uniform(56, 72) if sex == "F" else rnd.uniform(68, 88), 1)
        people.append(dict(name=name, role=roles[k], age=rnd.randint(32, 54), sex=sex, weight=w,
                           hand=round(rnd.uniform(18, 20.5) if sex == "F" else rnd.uniform(21.5, 24), 1), At=round(rnd.uniform(.75, 1.35), 2)))
    stories = {}
    for p in people:
        k = rnd.choice([0, 1, 1, 2])
        stories[p["name"]] = [(st, rnd.uniform(.3, .85) * day_now) for st in rnd.sample(list(SAMPLE_STORIES), k)]
    spe_day = int(rnd.uniform(.2, .95) * day_now) if rnd.random() < .5 else None
    eva_crew = rnd.sample([p["name"] for p in people], min(len(people), rnd.choice([0, 1, 2])))
    made = []
    for p in people:
        At = p.pop("At")
        d = new_crew_dict(mission=mission, launch=launch, A0=1, sample=True, **p)
        base = {}
        for v in RF.VARS:
            if v["f"] in ("calc", "eva") or v.get("env"):
                continue
            b = v["b"]
            if v["id"] not in ("amsler", "ijvf", "viral", "shift", "vis", "dlmo"):
                b = v["b"] + 0.7 * v["tol"] * clamp(gauss(), -2, 2)
            base[v["id"]] = round(b, max(v.get("dp", 1), 2))
        base["mass"] = p["weight"]
        base["kcal"] = round((2350 if p["sex"] == "F" else 2750) + 9 * (p["weight"] - (64 if p["sex"] == "F" else 78)))
        d["base"] = base
        store.db.x("INSERT OR REPLACE INTO crew VALUES (?,?)", (d["id"], json.dumps(d)))
        c = Crew(store, d)
        store.crew[c.id] = c
        rt = {v["id"]: clamp(1 + 0.2 * gauss(), 0.6, 1.5) for v in RF.VARS}
        rt["exer"] = rt["kcal"] = 1
        if At < 1:
            rt.update(kcal=0.5, sleep=0.7, ijv=0.9)
        N = int(math.floor(c.now_day()))
        name = p["name"]
        my = stories[name]

        def extra(vid, dd, my=my):
            e = 0.0
            for st, on in my:
                if dd > on:
                    e += SAMPLE_STORIES[st](dd - on, on).get(vid, 0)
            if vid == "dose" and spe_day is not None and spe_day <= dd < spe_day + 1:
                e += 7.5
            return e

        rows = []
        U, X = c.series()
        for dd in range(N + 1):
            for v in RF.VARS:
                if v["f"] in ("calc", "eva"):
                    continue
                per = {"cont": 1, "daily": 1, "d2": 2, "d3": 3, "weekly": 7}.get(v["f"], 7)
                if per > 1 and dd % per != per - 1:
                    continue
                if v["f"] == "daily" and rnd.random() < 0.06:
                    continue
                vid = v["id"]
                b = c.B(vid)
                E = RF.ENVS[c.env_at(dd)]["dose"] if v.get("env") else b + rt[vid] * (U if v.get("gs", 1) else X)[dd] * Crew.delta_at(v, b, dd, At)
                x = E + extra(vid, dd) + clamp(gauss(), -2.2, 2.2) * (0.08 * E if v.get("env") else (0.45 if v["f"] == "daily" else 0.6) * v["tol"])
                if vid in ("amsler", "ijvf"):
                    x = round(clamp(E + extra(vid, dd), 1 if vid == "ijvf" else 0, 3))
                if vid == "viral":
                    x = clamp(1.5 + gauss(), 0.5, 3.2) if rnd.random() < (0.45 if dd > 30 else 0.2) else 0
                if vid == "exer":
                    x = clamp(x, 30, 150)
                if vid not in ("dlmo", "vis") and x < 0:
                    x = 0.0
                if vid in ("mood", "stress"):
                    x = clamp(round(x), 1, 10)
                off = 0.3 if v["f"] == "cont" else 0.35 if v["f"] == "daily" else 0.4
                rows.append((c.id, vid, round(dd + off, 4), round(x, max(v.get("dp", 1), 2)), "a" if v["inv"] else "d"))
            for st, on in my:
                if dd > on + 12 and st == "sans" and dd % 3 == 0:
                    rows.append((c.id, "sym_headache", dd + 0.5, 1, "d"))
                if dd > on + 20 and st == "sans" and rnd.random() < .3:
                    rows.append((c.id, "sym_blur", dd + 0.5, 1, "d"))
                if dd > on + 4 and st == "sleep" and rnd.random() < .25:
                    rows.append((c.id, "sym_fatigue", dd + 0.5, 1, "d"))
                if dd > on + 8 and st == "bone" and rnd.random() < .12:
                    rows.append((c.id, "sym_back", dd + 0.5, 1, "d"))
        # random spacewalks: one nominal, sometimes one with a hand injury / high suit CO2
        if name in eva_crew and N > 10:
            hard = rnd.random() < .5
            ed = round(rnd.uniform(.35, .97) * N) + .6
            vals = dict(eva_prebreathe=rnd.choice([100, 120, 240]), eva_co2=round(rnd.uniform(4.6, 5.6) if hard else rnd.uniform(2.6, 3.6), 1),
                        eva_hrpct=rnd.randint(78, 86) if hard else rnd.randint(64, 76), eva_temp=round(rnd.uniform(37.9, 38.3) if hard else rnd.uniform(37.2, 37.7), 1),
                        eva_o2end=rnd.randint(20, 27) if hard else rnd.randint(32, 45), eva_hand=rnd.randint(3, 5) if hard else rnd.randint(0, 2), eva_nail=1 if hard and rnd.random() < .6 else 0,
                        eva_shoulder=rnd.randint(1, 3), eva_dcs=0, eva_hours7=round(rnd.uniform(5.8, 7.4), 1), eva_rest=rnd.randint(24, 72))
            for vid, x in vals.items():
                rows.append((c.id, vid, ed, x, "d"))
        store.db.xmany("INSERT INTO records (crew_id,var,day,value,src) VALUES (?,?,?,?,?)", rows)
        made.append(c)
    # reload records with ids, then compute formulas day by day
    for c in made:
        store.recs[c.id] = [[rid, var, day, val, src] for rid, var, day, val, src in
                            store.db.q("SELECT id, var, day, value, src FROM records WHERE crew_id=? ORDER BY day", (c.id,))]
        c.reset()
    store.bulk = []
    for c in made:
        for dd in sorted({r[2] for r in c.recs}):
            c.derive(dd)
    rows = [(cid, var, day, val, src) for _, cid, var, day, val, src in store.bulk]
    store.bulk = None
    store.db.xmany("INSERT INTO records (crew_id,var,day,value,src) VALUES (?,?,?,?,?)", rows)
    for c in made:
        store.recs[c.id] = [[rid, var, day, val, src] for rid, var, day, val, src in
                            store.db.q("SELECT id, var, day, value, src FROM records WHERE crew_id=? ORDER BY day", (c.id,))]
        c.reset()
    return made


# ---------------------------------------------------------------- simulated assessment (demonstration)
def simulate_panel(c: Crew, d, panels, scenario="typical"):
    """Plausible values for the chosen panels: the astronaut's expected value plus normal variation.
    scenario 'issues' pushes two measures off their trajectory so the warning/alert logic can be seen working."""
    ids = []
    for p in RF.PANELS:
        if (not panels and p["id"] != "eva") or p["id"] in panels:
            ids += [v for v in p["v"] if v not in ids]
    out = {}
    for vid in ids:
        v = RF.VM[vid]
        E, t = c.expected(vid, d), c.tol(vid, d)
        x = E + clamp(random.gauss(0, 0.7), -1.6, 1.6) * t
        if vid == "eva_prebreathe":
            x = 100
        if vid in ("eva_nail", "eva_dcs", "amsler"):
            x = 0
        out[vid] = x
    if scenario == "issues" and ids:
        rnd = random.Random()
        pick = [i for i in ids if RF.VM[i]["dir"] != "lo" and not RF.VM[i].get("env") and i not in ("eva_dcs", "eva_prebreathe")][:]
        rnd.shuffle(pick)
        for k, vid in enumerate(pick[:2]):
            E, t = c.expected(vid, d), c.tol(vid, d)
            out[vid] = E + (2.5 if k == 0 else 3.6) * t
    for vid in list(out):
        v = RF.VM[vid]
        out[vid] = round(max(0.0, out[vid]) if vid not in ("dlmo", "vis") else out[vid], max(v.get("dp", 1), 2))
    return out


# ---------------------------------------------------------------- values from any input (speech text, photo, file)
def ocr_image(data: bytes):
    try:
        import pytesseract
        img = Image.open(io.BytesIO(data)).convert("L")
        if max(img.size) < 1400:
            s = 1400 / max(img.size)
            img = img.resize((int(img.width * s), int(img.height * s)))
        return pytesseract.image_to_string(img), None
    except Exception as e:
        return "", "Reading photos needs the free Tesseract OCR program installed (see README)." if "tesseract" in str(e).lower() else f"Could not read the photo ({e.__class__.__name__})."


def file_text_and_rows(filename, data: bytes):
    fn = filename.lower()
    rows, text = [], ""
    if fn.endswith((".csv", ".tsv", ".txt")):
        text = data.decode("utf-8", "replace")
        rows = [re.split(r"[,;\t]", ln) for ln in text.splitlines()]
    elif fn.endswith(".json"):
        try:
            j = json.loads(data.decode("utf-8", "replace"))
            items = j if isinstance(j, list) else j.get("data", [j]) if isinstance(j, dict) else []
            for o in items:
                if isinstance(o, dict):
                    if "value" in o:
                        rows.append([o.get("metric") or o.get("id") or o.get("name"), o["value"]])
                    else:
                        rows += [[k, v] for k, v in o.items()]
        except ValueError:
            pass
    elif fn.endswith((".xlsx", ".xlsm")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
        for ws in wb:
            rows += [["" if x is None else x for x in r] for r in ws.iter_rows(values_only=True)]
    elif fn.endswith(".pdf"):
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for p in pdf.pages:
                for t in p.extract_tables() or []:
                    rows += t
                text += (p.extract_text() or "") + "\n"
    elif fn.endswith(".docx"):
        import docx
        d = docx.Document(io.BytesIO(data))
        for t in d.tables:
            rows += [[c.text for c in r.cells] for r in t.rows]
        text = "\n".join(p.text for p in d.paragraphs)
    return text, rows


def values_from_rows(rows, scope=None):
    out = {}
    rows = [[str(c).strip() if c is not None else "" for c in r] for r in rows if r]
    # layout A: one measure per row (name, value, …)
    for r in rows:
        if len(r) < 2:
            continue
        vid = map_metric(r[0])
        if not vid:
            hit = parse_utterance(r[0] + " 0", scope)["vals"]
            vid = hit[0][0] if hit else None
        if vid and (not scope or vid in scope):
            for cell in r[1:]:
                try:
                    out.setdefault(vid, float(re.sub(r"[^\d.\-]", "", cell)))
                    break
                except ValueError:
                    continue
    # layout B: header row of names, values below
    if not out and len(rows) >= 2:
        head = [map_metric(h) or (parse_utterance(h + " 0", scope)["vals"] or [[None]])[0][0] for h in rows[0]]
        for k, vid in enumerate(head):
            if vid and (not scope or vid in scope) and k < len(rows[1]):
                try:
                    out[vid] = float(re.sub(r"[^\d.\-]", "", rows[1][k]))
                except ValueError:
                    pass
    return out


def extract_values(text=None, filename=None, data=None, scope=None):
    note = ""
    vals = {}
    if data is not None:
        fn = (filename or "").lower()
        if fn.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".heic", ".tif", ".tiff")) or not fn:
            from .ai import hooks as AI
            ai = AI.read_device_photo(data, scope or [])
            if ai:
                vals = {o["id"]: o["value"] for o in ai}
                note = "Read by AI"
            else:
                text, note = ocr_image(data)
                if not note:
                    note = "Read from the photo with OCR: check every value."
        else:
            text, rows = file_text_and_rows(filename, data)
            vals = values_from_rows(rows, scope)
    if text and not vals:
        vals = {k: v for k, v in parse_utterance(text, scope)["vals"]}
    if text:
        sym = parse_utterance(text)["sym"]
    else:
        sym = []
    return {"vals": [{"v": k, "n": RF.VM[k]["n"], "u": RF.VM[k]["u"], "value": v} for k, v in vals.items() if k in RF.VM],
            "sym": sym, "note": note, "text": (text or "")[:2000]}
