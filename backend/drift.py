"""Vitals in the Void — Drift Vector: predictive physiological trend forecasting 24–48 h ahead,
driven by the astronaut's surroundings environment.

Read-only add-on: it uses the astronaut's existing model (personal baseline, expected trajectory,
tolerances, limits, recent readings, 14-day trend) and never writes records or changes any status.

For each of 11 markers, every 3 h up to the horizon:
    forecast = expected trajectory (personal model)
             + momentum (today's gap from expected decaying over ~38 h, plus the 14-day trend)
             + environment perturbation (CO2, temperature, O2, humidity, radiation, noise, dust,
               gravity and light cycle; first-order kinetics with 12–24 h time constants)
             + daily (circadian) rhythm
    95 % band = forecast ± 1.96 σ, σ growing with lead time and with how far the surroundings are
                from the mission baseline.
Crossings of the clinical (warning) and safety (critical) limits are located by interpolation.
"""
import math
from datetime import datetime, timezone

from . import reference as RF

VARS = ["hr", "hrv", "sbp", "spo2", "ctemp", "shift", "onsd", "sleep", "pvt", "stress", "dose"]
PRESETS = [
    {"id": "mission", "name": "Mission baseline", "sub": "Auto-synced to the active mission habitat"},
    {"id": "high_co2", "name": "Elevated CO₂ node", "sub": "4.9 mmHg ppCO₂ · 24.8 °C · 66 dBA"},
    {"id": "spe_shelter", "name": "SPE storm shelter", "sub": "7.8 mSv/d · cramped · shifted light"},
    {"id": "eva_airlock", "name": "EVA airlock prep", "sub": "19.4% O₂ · 26.2 °C · suit thermal load"},
    {"id": "surface_dust", "name": "Surface dust hab", "sub": "Regolith PM · 23% RH · 17.5 °C"},
    {"id": "sleep_quarters", "name": "Sleep quarters", "sub": "19.5 °C · 42 dBA · dim red-shifted"},
]
LVN = ["Nominal", "Drifting", "Threshold breach"]


def clamp(x, a, b):
    return max(a, min(b, x))


def f1(x, dp):
    return f"{x:.{max(0, dp)}f}"


def mission_env(c):
    d = c.now_day()
    k = c.env_at(d)
    e = RF.ENVS.get(k, RF.ENVS["leo"])
    return {"envKey": k, "envName": e["n"], "g": e["g"], "co2": 0.4 if k == "earth" else 2.3, "temp": 21.5, "o2": 21.0, "rh": 45,
            "rad": e["dose"], "noise": 45 if k == "earth" else 58 if k == "leo" else 54, "dust": 0.15 if k in ("moon", "mars") else 0.02, "light": "aligned"}


def preset_env(c, pid):
    b = mission_env(c)
    p = {
        "high_co2": dict(co2=4.9, temp=24.8, o2=20.4, rh=58, noise=66, dust=0.04, light="aligned"),
        "spe_shelter": dict(co2=3.8, temp=19.0, o2=20.6, rh=52, rad=7.8, noise=64, dust=0.03, light="shifted"),
        "eva_airlock": dict(co2=3.4, temp=26.2, o2=19.4, rh=64, rad=max(b["rad"] * 1.6, 1.4), noise=69, dust=0.05, light="aligned"),
        "surface_dust": dict(g=0.38 if b["envKey"] == "mars" else 0.166, co2=2.8, temp=17.5, o2=20.8, rh=23, rad=1.37, noise=59, dust=1.45, light="shifted"),
        "sleep_quarters": dict(co2=1.8, temp=19.5, o2=21.2, rh=46, rad=max(0.01, round(b["rad"] * 0.8, 2)), noise=42, dust=0.01, light="dim"),
    }.get(pid)
    return {**b, **p} if p else b


def drivers(vid, env, base):
    out = []
    co2x, tx, o2d, nx = max(0, env["co2"] - 2.3), env["temp"] - 21.5, max(0, 20.8 - env["o2"]), max(0, env["noise"] - 56)
    dg = abs(env["g"] - base["g"])
    g = env["g"]
    if vid == "onsd":
        if co2x > .5: out.append(f"Cabin ppCO₂ ({env['co2']:.1f} mmHg)")
        if g < .2: out.append(f"Cephalic fluid shift ({g} g)")
    elif vid == "hr":
        if co2x > .6: out.append(f"Hypercapnic drive ({env['co2']:.1f} mmHg CO₂)")
        if tx > 1.5: out.append(f"Cabin thermal load ({env['temp']:.1f} °C)")
        if o2d > .4: out.append(f"Reduced O₂ ({env['o2']:.1f}%)")
        if env["light"] == "dim" and env["noise"] < 48: out.append(f"Quiet sleep recovery ({round(env['noise'])} dBA)")
    elif vid == "hrv":
        if co2x > .6: out.append(f"Elevated CO₂ ({env['co2']:.1f} mmHg)")
        if nx > 4: out.append(f"Acoustic load ({round(env['noise'])} dBA)")
        if env["rad"] > 2.5: out.append(f"Radiation stress ({env['rad']:.1f} mSv/d)")
        if env["light"] == "dim" and env["noise"] < 48: out.append("Parasympathetic recovery")
    elif vid == "spo2":
        if o2d > .3: out.append(f"Ambient O₂ ({env['o2']:.1f}%)")
        if env["dust"] > .3: out.append(f"Regolith dust load ({env['dust']:.2f} mg/m³)")
    elif vid == "ctemp":
        if abs(tx) > 1.5: out.append(f"Cabin temp ({env['temp']:.1f} °C)")
        if env["light"] == "shifted": out.append("Circadian phase shift")
    elif vid == "shift":
        if dg > .05: out.append(f"Gravity shift ({g} g)")
        elif g < .2: out.append(f"Microgravity ({g} g)")
        if tx > 1.5: out.append(f"Warm vasodilation ({env['temp']:.1f} °C)")
    elif vid == "sleep":
        if nx > 3: out.append(f"Acoustic load ({round(env['noise'])} dBA)")
        if env["light"] == "shifted": out.append("Light cycle misalignment")
        if env["light"] == "dim" and env["noise"] < 48: out.append("Dark quiet sleep bay")
        if co2x > .8: out.append(f"Cabin CO₂ ({env['co2']:.1f} mmHg)")
    elif vid == "pvt":
        if co2x > .6: out.append(f"CO₂ cognitive drag ({env['co2']:.1f} mmHg)")
        if env["light"] == "shifted" or nx > 6: out.append("Sleep/circadian fatigue")
        if o2d > .5: out.append(f"Mild hypoxia ({env['o2']:.1f}% O₂)")
    elif vid == "stress":
        if env["rad"] > 2.5: out.append(f"SPE radiation ({env['rad']:.1f} mSv/d)")
        if nx > 4: out.append(f"Acoustic load ({round(env['noise'])} dBA)")
        if co2x > .8: out.append(f"Elevated CO₂ ({env['co2']:.1f} mmHg)")
        if env["rh"] < 30: out.append(f"Dry cabin air ({round(env['rh'])}% RH)")
    elif vid == "dose":
        out.append(f"Ambient shielding ({env['rad']:.2f} mSv/d)")
    elif vid == "sbp":
        if dg > .05: out.append(f"Gravity shift ({g} g)")
        if co2x > .8: out.append("Sympathetic CO₂ drive")
        if tx < -1.5: out.append("Cool vasoconstriction")
    if not out:
        out.append(f"Nominal habitat ({g} g)")
    return " · ".join(out[:2])


def env_delta(vid, t, env, base):
    k12, k18, k24 = 1 - math.exp(-t / 12), 1 - math.exp(-t / 18), 1 - math.exp(-t / 24)
    co2x, co2c = max(0, env["co2"] - 2.3), max(0, 2.3 - env["co2"])
    tx = env["temp"] - 21.5
    o2d, o2p = max(0, 20.8 - env["o2"]), max(0, env["o2"] - 21.0)
    rhl = max(0, 32 - env["rh"])
    nx, nq = max(0, env["noise"] - 56), max(0, 52 - env["noise"])
    dx = max(0, env["dust"] - 0.15)
    rx = max(0, env["rad"] - max(base["rad"], 0.6))
    dgm = (1 - env["g"]) - (1 - base["g"])
    ls, ld = (1 if env["light"] == "shifted" else 0), (1 if env["light"] == "dim" else 0)
    if vid == "hr":
        return (2.5 * co2x + 1.65 * max(0, tx - .8) + 3.1 * o2d + .18 * nx + 1.7 * dx + .65 * rx - .25 * nq - 1.5 * ld - 4.0 * dgm * .25) * k12
    if vid == "hrv":
        return (-3.8 * co2x - 1.8 * max(0, tx - 1) - .35 * nx - 1.1 * rx - 2.6 * ls + .42 * nq + 3.2 * ld + 1.8 * co2c) * k12
    if vid == "sbp":
        return (2.6 * co2x + 1.9 * max(0, -tx - 1.5) - 1.1 * max(0, tx - 2) + .24 * nx + 6.5 * dgm) * k18
    if vid == "spo2":
        return (-1.05 * o2d - .85 * dx - .18 * co2x + .35 * o2p) * k12
    if vid == "ctemp":
        return (.095 * max(0, tx - 1) - .045 * max(0, -tx - 2) + .12 * ls - .06 * ld) * k12
    if vid == "shift":
        return (1.45 * dgm + .045 * max(0, tx - 1) + .04 * co2x) * k24
    if vid == "onsd":
        return (.19 * co2x + .55 * dgm + .04 * max(0, rx - 2)) * k18
    if vid == "sleep":
        dt = abs(env["temp"] - 19.8)
        return (-.28 * co2x - .14 * dt * (1 if dt > 2 else 0) - .085 * nx - .68 * ls - .03 * rhl + .055 * nq + .45 * ld) * k24
    if vid == "pvt":
        return (12 * co2x + 1.5 * nx + 15 * ls + 9.5 * o2d + 1.2 * max(0, tx - 2) - 9 * ld - .5 * nq) * k18
    if vid == "stress":
        return (.42 * co2x + .085 * nx + .24 * rx + .65 * ls + .04 * rhl + .45 * dx - .75 * ld - .06 * nq) * k12
    if vid == "dose":
        return (env["rad"] - base["rad"]) * (1 - math.exp(-t / 4))
    return 0.0


def diurnal(vid, t, hour0):
    ph = ((hour0 + t) % 24) / 24 * math.pi * 2
    return {"hr": 4.2 * math.sin(ph - 1.9), "hrv": -3.8 * math.sin(ph - 1.9), "ctemp": .28 * math.sin(ph - 2.2),
            "sbp": 3.6 * math.sin(ph - 1.8), "pvt": -7.5 * math.sin(ph - 2.1)}.get(vid, 0.0)


def clean_env(c, env):
    base = mission_env(c)
    if not isinstance(env, dict):
        return base
    out = dict(base)
    rng = {"g": (0, 1), "co2": (0.4, 6), "temp": (16, 28), "o2": (18.5, 22.5), "rh": (20, 75), "rad": (0.01, 10), "noise": (40, 74), "dust": (0, 2)}
    for k, (a, b) in rng.items():
        if k in env:
            try:
                out[k] = clamp(float(env[k]), a, b)
            except (TypeError, ValueError):
                pass
    if env.get("light") in ("aligned", "shifted", "dim"):
        out["light"] = env["light"]
    return out


def forecast(c, env, horizon=24):
    horizon = horizon if horizon in (24, 36, 48) else 24
    d = c.now_day()
    base = mission_env(c)
    env = clean_env(c, env)
    now = datetime.now(timezone.utc)
    hour0 = now.hour + now.minute / 60
    step = 3
    series, summaries = {}, []
    for vid in VARS:
        v = RF.VM[vid]
        dp = v.get("dp", 1)
        lims = dict(c.lims(vid))
        if vid == "dose":
            db = max(base["rad"], 0.2)
            lims["wh"] = lims.get("wh") if lims.get("wh") is not None else 2.2 * db
            lims["ch"] = lims.get("ch") if lims.get("ch") is not None else 5.0 * db
        E0 = c.expected(vid, d)
        last = c.latest(vid, d)
        cur = last[3] if last else E0
        tr = c.trend(vid, d)
        tol = max(c.tol(vid, d), 0.15 if vid == "dose" else 0.01)
        gap = cur - E0
        slope = clamp(tr["dev"] * tol / 14, -0.35 * tol, 0.35 * tol) if tr else 0.0
        hist = [{"h": round((r[2] - d) * 24, 2), "val": r[3]} for r in c.of_var(vid) if d - 1.5 <= r[2] <= d + 1e-6]
        if not hist and last:
            hist = [{"h": max(-24, (last[2] - d) * 24), "val": last[3]}]
        escale = abs(env_delta(vid, horizon, env, base)) / tol
        pts, first, first_l, peak = [], None, 0, 0.0
        for h in range(0, horizon + 1, step):
            fd = d + h / 24
            eb = c.expected(vid, fd)
            mom = gap * math.exp(-h / 38) + slope * (h / 24) * math.exp(-h / 60)
            pred = cur if h == 0 else eb + mom + env_delta(vid, h, env, base) + diurnal(vid, h, hour0) * min(1, h / 6)
            if vid == "spo2": pred = clamp(pred, 75, 100)
            if vid == "sleep": pred = clamp(pred, 2, 11.5)
            if vid == "stress": pred = clamp(pred, 1, 10)
            if vid in ("shift", "dose", "pvt", "hrv", "hr"): pred = max(0, pred)
            sig = tol * (.45 + .6 * math.sqrt(h / 48) + .12 * min(2, escale))
            hi, lo = pred + 1.96 * sig, pred - 1.96 * sig
            if vid == "spo2": hi, lo = min(100, hi), max(70, lo)
            if vid == "stress": hi, lo = min(10, hi), max(1, lo)
            if vid in ("dose", "shift", "hrv", "pvt"): lo = max(0, lo)
            lvl = 0
            if lims.get("ch") is not None and pred > lims["ch"]: lvl = 2
            elif lims.get("cl") is not None and pred < lims["cl"]: lvl = 2
            elif lims.get("wh") is not None and pred > lims["wh"]: lvl = 1
            elif lims.get("wl") is not None and pred < lims["wl"]: lvl = 1
            elif abs(pred - eb) > 2.2 * tol: lvl = 1
            if h > 0 and lvl > 0 and first is None:
                first, first_l = h, lvl
            if h > 0 and lvl > first_l:
                first_l = lvl
            peak = max(peak, abs(pred - eb) / tol)
            pts.append({"h": h, "pred": pred, "base": eb, "lo": lo, "hi": hi, "lvl": lvl, "sigma": sig})
        u = (" " + v["u"]) if v.get("u") else ""
        crit, warn = [], []
        if pts and pts[0]["lvl"] == 2:
            k = "ch" if lims.get("ch") is not None and pts[0]["pred"] > lims["ch"] else "cl"
            crit.append({"h": 0, "val": pts[0]["pred"], "limitVal": lims[k], "limitKey": k, "dir": "active",
                         "label": f"Breached {'>' if k == 'ch' else '<'} {f1(lims[k], dp)}{u} at T+0h"})

        def scan(key, high, arr):
            lv = lims.get(key)
            if lv is None:
                return
            for i in range(1, len(pts)):
                p0, p1 = pts[i - 1], pts[i]
                ent = (p0["pred"] <= lv < p1["pred"]) if high else (p0["pred"] >= lv > p1["pred"])
                ext = (p0["pred"] > lv >= p1["pred"]) if high else (p0["pred"] < lv <= p1["pred"])
                if not ent and not ext:
                    continue
                den = p1["pred"] - p0["pred"]
                fr = clamp((lv - p0["pred"]) / den, 0, 1) if abs(den) > 1e-9 else .5
                arr.append({"h": round(p0["h"] + fr * (p1["h"] - p0["h"]), 1), "val": lv, "limitVal": lv, "limitKey": key, "dir": "entry" if ent else "exit",
                            "label": f"{'Crossed' if ent else 'Recovered'} {'>' if high else '<'} {f1(lv, dp)}{u}"})
        scan("ch", True, crit); scan("cl", False, crit); scan("wh", True, warn); scan("wl", False, warn)
        crit.sort(key=lambda x: x["h"]); warn.sort(key=lambda x: x["h"])
        cpts = [p for p in pts if p["lvl"] == 2]
        fce = next((x for x in crit if x["dir"] in ("entry", "active")), crit[0] if crit else None)
        fch = fce["h"] if fce else (cpts[0]["h"] if cpts else None)
        fwe = next((x for x in warn if x["dir"] == "entry"), warn[0] if warn else None)
        cross = fch if fch is not None else (fwe["h"] if fwe else first)
        p24 = next((p for p in pts if p["h"] == 24), pts[len(pts) // 2])
        pe = pts[-1]
        info = {"v": vid, "n": v["n"], "u": v.get("u", ""), "dp": dp, "cur": cur, "v24": p24["pred"], "vEnd": pe["pred"], "baseEnd": pe["base"],
                "netDrift": pe["pred"] - cur, "envOnlyDrift": pe["pred"] - pe["base"], "crossH": cross, "critCrossH": fch,
                "critCrossings": crit, "warnCrossings": warn, "critPts": cpts, "lvl": max(first_l, pe["lvl"]), "peakZ": peak,
                "driver": drivers(vid, env, base), "lims": lims, "tol": tol, "hist": hist, "pts": pts}
        series[vid] = info
        summaries.append(info)
    worst = max(s["lvl"] for s in summaries)
    earliest = min((s for s in summaries if s["crossH"] is not None), key=lambda s: s["crossH"], default=None)
    earliest_c = min((s for s in summaries if s["critCrossH"] is not None), key=lambda s: s["critCrossH"], default=None)
    peak = max(summaries, key=lambda s: s["peakZ"])
    ci = c.crew_index(d)
    ci = 92 if ci is None else ci
    nw, na = sum(1 for s in summaries if s["lvl"] == 1), sum(1 for s in summaries if s["lvl"] == 2)
    pidx = clamp(round(ci - na * 11 - nw * 4 + (3 if env["light"] == "dim" and env["noise"] < 48 and env["co2"] <= 2.3 else 0)), 0, 100)
    adv = []
    if env["co2"] > 3.2:
        adv.append({"lvl": 2 if env["co2"] >= 4.5 else 1, "t": "Scrub cabin CO₂ below 2.5 mmHg",
                    "d": f"Current ppCO₂ ({env['co2']:.1f} mmHg) drives cerebral vasodilation (+{env_delta('onsd', horizon, env, base):.2f} mm optic nerve sheath) and slower reactions (+{env_delta('pvt', horizon, env, base):.0f} ms) within {horizon} h."})
    if env["rad"] > 2.5:
        adv.append({"lvl": 2, "t": "Stay in solar particle storm shielding", "d": f"Ambient dose rate ({env['rad']:.2f} mSv/d) raises cumulative dose and autonomic stress. Restrict unshielded module transit."})
    if env["o2"] < 20.2 or env["dust"] > 0.5:
        adv.append({"lvl": 1, "t": "Engage HEPA filtration and O₂ trim", "d": f"Reduced O₂ ({env['o2']:.1f}%) or airborne dust ({env['dust']:.2f} mg/m³) projects SpO₂ drifting toward {series['spo2']['vEnd']:.1f}%."})
    if env["temp"] > 23.5 or env["rh"] < 30:
        adv.append({"lvl": 1, "t": "Add electrolyte hydration (+450 mL/day)", "d": f"Cabin {env['temp']:.1f} °C and {round(env['rh'])}% RH increase water loss and resting heart rate drift."})
    if env["noise"] > 60 or env["light"] == "shifted":
        adv.append({"lvl": 1, "t": "Protect the circadian sleep window (noise < 50 dBA)",
                    "d": f"Projected sleep falls to {series['sleep']['vEnd']:.1f} h with HRV change {series['hrv']['netDrift']:+.1f} ms. Use acoustic attenuation and dim red-shifted lighting."})
    if not adv:
        adv.append({"lvl": 0, "t": "Surroundings support physiological stability", "d": f"No environment-driven warning or limit crossing is forecast across the next {horizon} hours. Continue nominal countermeasures."})
    return {"day": d, "horizonH": horizon, "env": env, "missionBase": base, "summaries": summaries, "seriesMap": series, "worstLvl": worst,
            "earliest": earliest["v"] if earliest else None, "earliestCrit": earliest_c["v"] if earliest_c else None, "peakVar": peak["v"],
            "curIdx": ci, "predIdx": pidx, "advisories": adv, "presets": PRESETS, "levels": LVN}
