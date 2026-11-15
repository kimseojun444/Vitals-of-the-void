"""Personalised daily exercise and meal plan, built from the astronaut's current health status.

Exercise follows the NASA SPRINT protocol (English et al., npj Microgravity 2020): high-intensity resistance training
3 days a week, aerobic intervals (8×30 s, 6×2 min, 4×4 min) on 3 days, continuous aerobic on the others.
Nutrition targets follow NASA spaceflight nutrition requirements (Smith & Zwart): energy to requirement,
protein 1.2–1.5 g/kg, vitamin D 800 IU, calcium 1000–1200 mg, sodium kept low, ≥ 2.5 L fluid.
Food items are examples of the ISS food system categories; portions are approximate.
"""
import math

from . import reference as RF

DEVICES = {
    "leo": {"res": "ARED (resistance device)", "run": "T2 treadmill with harness", "bike": "CEVIS cycle"},
    "cis": {"res": "flywheel resistance device", "run": "flywheel rowing mode", "bike": "flywheel rowing mode"},
    "moon": {"res": "compact resistance device", "run": "surface walking / treadmill", "bike": "compact cycle"},
    "mars": {"res": "compact resistance device", "run": "surface walking / treadmill", "bike": "compact cycle"},
    "earth": {"res": "gym resistance equipment", "run": "treadmill or walking", "bike": "stationary bike"},
}
WEEK = [("Resistance A + 4×4-min intervals", "resA", "i4"), ("Continuous aerobic + mobility", None, "cont"),
        ("Resistance B + 6×2-min intervals", "resB", "i2"), ("Continuous aerobic + balance", None, "cont"),
        ("Resistance A + 8×30-s sprints", "resA", "i30"), ("Longer continuous aerobic", None, "cont45"), ("Recovery day", None, "rest")]

# name, category, kcal, protein g, tags
FOODS = {
    "eggs": ("Scrambled eggs", "Rehydratable", 180, 12, {"bvit"}), "oat": ("Oatmeal with raisins", "Rehydratable", 200, 6, {"sugar"}),
    "tort": ("Tortilla", "Extended shelf-life bread", 110, 3, set()), "pb": ("Peanut butter (2 tbsp)", "Natural form", 190, 7, set()),
    "ibd": ("Instant breakfast drink (milk-based)", "Beverage", 220, 12, {"calcium"}), "coffee": ("Coffee or tea", "Beverage", 5, 0, {"caffeine"}),
    "tea": ("Herbal tea or water", "Beverage", 2, 0, set()), "juice": ("Orange-mango drink", "Beverage", 100, 0, {"sugar"}),
    "tuna": ("Tuna (pouch)", "Thermostabilized", 150, 22, {"bvit"}), "broc": ("Broccoli au gratin", "Rehydratable", 130, 6, {"calcium", "bvit"}),
    "fruit": ("Fruit cocktail", "Thermostabilized", 120, 1, {"k"}), "chick": ("Chicken with rice", "Rehydratable", 300, 20, set()),
    "spin": ("Creamed spinach", "Rehydratable", 90, 4, {"bvit", "k", "calcium"}), "lent": ("Lentils or beans", "Thermostabilized", 180, 12, {"bvit", "k"}),
    "turkey": ("Smoked turkey", "Irradiated", 120, 18, set()), "brisket": ("Beef brisket", "Thermostabilized", 260, 24, {"salty"}),
    "mac": ("Macaroni and cheese", "Rehydratable", 330, 14, {"salty", "calcium"}), "pud": ("Vanilla pudding", "Thermostabilized", 180, 3, {"sugar", "calcium"}),
    "almond": ("Almonds", "Natural form", 170, 6, {"k"}), "apricot": ("Dried apricots", "Intermediate moisture", 100, 1, {"k"}),
    "granola": ("Granola bar", "Natural form", 190, 4, {"sugar"}), "shake": ("Protein shake (whey)", "Natural form", 120, 24, set()),
    "veg": ("Green beans with mushrooms", "Thermostabilized", 70, 3, {"k", "bvit"}),
}


def _flag(c, d, cid):
    return c.cond_status(cid, d)["lvl"]


def _off(c, d, vid):
    r, st = c.status_latest(vid, d, 21)
    return st["lvl"] if st else 0


def build_plan(c, supplies):
    d = c.now_day()
    env = c.env_at(d)
    dev = DEVICES.get(env, DEVICES["leo"])
    mass = c.B("mass")
    kcal = c.B("kcal")
    F = {k["id"]: _flag(c, d, k["id"]) for k in RF.CONDS}
    why, avoid, notes = [], [], []

    # ---------- is exercise safe today?
    hold = []
    for vid, t in (("spo2", "low oxygen saturation"), ("ctemp", "fever"), ("qtc", "QTc on ECG"), ("hr", "resting heart rate"), ("eva_dcs", "decompression-sickness signs")):
        r, st = c.status_latest(vid, d, 2 if vid != "eva_dcs" else 7)
        if st and st["lvl"] == 2:
            hold.append(t)
    sym = {r[1][4:] for r in c.symptoms_recent(d)}
    if sym & {"chest", "breath", "fever", "dizzy"}:
        hold.append("reported symptoms (" + ", ".join(sorted(sym & {"chest", "breath", "fever", "dizzy"})) + ")")
    last_eva = max([r[2] for r in c.recs if r[1].startswith("eva_")] or [-99])
    eva_recent = d - last_eva < 1.5

    # ---------- exercise
    slot = WEEK[int(math.floor(max(d, 0))) % 7]
    title, res, aer = slot
    blocks = []
    if hold:
        title = "Exercise on hold today"
        blocks.append({"n": "Rest and re-check", "d": "Hard exercise is paused because of " + ", ".join(hold) + ". Light stretching only, until the flight surgeon clears you.", "min": 15})
    elif eva_recent:
        title = "Post-spacewalk recovery day"
        blocks += [{"n": "Hand & forearm recovery", "d": "Gentle finger flexion/extension, wrist circles, 3 × 15; no heavy grip work today.", "min": 10},
                   {"n": "Shoulder mobility", "d": "Pendulum swings, wall slides, cross-body stretch, 2 × 10 each side.", "min": 10},
                   {"n": "Easy aerobic", "d": f"20 min easy on the {dev['bike']} at a talking pace.", "min": 20}]
    else:
        if res:
            sets = 4 if (F["muscle"] or F["bone"]) else 3
            lower = [("Squat", "6–8 reps, heavy"), ("Deadlift", "6–8 reps"), ("Heel raise", "12–15 reps, slow")]
            upper = [("Bench press", "8–10 reps"), ("Bent-over row", "8–10 reps"), ("Shoulder press", "8–10 reps")]
            ex = lower + (upper if res == "resB" else [("Romanian deadlift", "8–10 reps")])
            if F["bone"]:
                ex.append(("Single-leg heel raise", "2 × 15 each side: high-strain loading for the shin and hip"))
            txt = "; ".join(f"{n} {sets} × {r}" for n, r in ex)
            blocks.append({"n": f"Resistance session on {dev['res']}", "d": txt + ". Rest 90–120 s between sets.", "min": 45})
        if aer == "i4":
            blocks.append({"n": "4 × 4-min intervals", "d": f"On the {dev['bike']}: 4 min at ~90 % of max heart rate, 3 min easy, × 4.", "min": 30})
        elif aer == "i2":
            blocks.append({"n": "6 × 2-min intervals", "d": f"On the {dev['run']}: 2 min hard (~90 % max HR), 2 min easy, × 6.", "min": 30})
        elif aer == "i30":
            blocks.append({"n": "8 × 30-s sprints", "d": f"On the {dev['bike']}: 30 s all-out, 15 s rest, × 8, after a 5-min warm-up.", "min": 20})
        elif aer == "cont":
            blocks.append({"n": "Continuous aerobic", "d": f"30 min at ~75 % of max heart rate on the {dev['run']}.", "min": 30})
        elif aer == "cont45":
            blocks.append({"n": "Long continuous aerobic", "d": f"45 min at ~70 % of max heart rate on the {dev['run']}.", "min": 45})
        else:
            blocks.append({"n": "Recovery", "d": "Mobility, foam-roller and 20 min easy cycling. Recovery protects you from overuse injury.", "min": 30})
        if env == "leo" and aer in ("i2", "cont", "cont45"):
            notes.append("On the treadmill, load the harness to at least 70 % of body weight so the bones and muscles get real loading.")
        blocks.append({"n": "Mobility & core", "d": "Hip flexor and calf stretch, plank 3 × 30 s, back extension 2 × 12 (supports the spine, which lengthens in microgravity).", "min": 10})
    total = sum(b["min"] for b in blocks)

    # ---------- personalisation reasons
    if F["bone"]:
        why.append("Bone markers are off your trajectory: extra high-load lower-body work, lower sodium, plenty of fluid.")
    if F["muscle"]:
        why.append("Muscle size or strength is below trajectory: an extra set per exercise and protein raised to 1.5 g/kg.")
    if F["metab"]:
        why.append("Glucose/insulin markers are raised: a 10–15 min easy session after your largest meal, low-sugar choices.")
        blocks.append({"n": "After-meal walk/cycle", "d": "10–15 min easy within 30 min after lunch or dinner (lowers the glucose spike).", "min": 15})
        total += 15
    if F["cv"] or F["vasc"]:
        why.append("Heart/vessel measures are flagged: interval sessions are kept, and intensity is guided by heart rate.")
    if F["sleep"]:
        why.append("Sleep is short: finish hard exercise at least 3 h before sleep; caffeine only at breakfast.")
        avoid.append("Hard exercise in the 3 h before sleep")
    if F["sans"] or F["fluid"]:
        why.append("Eye/head-fluid measures are flagged: breathe out on each lift and avoid breath-holding (Valsalva) and head-down positions.")
        avoid.append("Breath-holding during lifts; head-down positions")
    if F["anemia"]:
        why.append("Red-cell measures are low: pace intervals by effort (RPE 7/10) rather than by maximum.")
    if F["eva"]:
        why.append("Spacewalk injuries reported: protect hands and shoulders; no heavy grip work until pain is under 3/10.")
        avoid.append("Heavy grip and overhead pressing while hand/shoulder pain ≥ 3/10")
    if not why:
        why.append("All systems are in range: follow the standard SPRINT schedule to keep it that way.")

    # ---------- nutrition targets
    k_t = kcal * (1.1 if (F["nutr"] or _off(c, d, "mass")) else 1.0)
    prot = (1.5 if (F["muscle"] or F["bone"]) else 1.2) * mass
    fluid = max(2.5, k_t / 1000) + (0.5 if (F["bone"] or F["lytes"]) else 0)
    targets = [("Energy", f"{k_t:,.0f} kcal", "your requirement" + (" +10 % (intake/mass low)" if k_t > kcal else "")),
               ("Protein", f"{prot:.0f} g", f"{prot / mass:.1f} g per kg body mass"), ("Fluid", f"{fluid:.1f} L", "aim for pale urine (SG < 1.020)"),
               ("Sodium", "< 2,300 mg", "high salt raises urine calcium and bone loss"), ("Calcium", "1,000–1,200 mg", "not more: excess adds stone risk"),
               ("Vitamin D", "800 IU", "one supplement tablet daily")]

    # ---------- meals
    sleep_bad = bool(F["sleep"])
    metab = bool(F["metab"])
    salty_ok = not (F["bone"] or F["cv"] or F["lytes"])
    bvit = bool(F["sans"])
    musc = bool(F["muscle"] or F["bone"])
    M = [
        ("Breakfast", "07:00", ["eggs", "tort", "pb", "ibd", "coffee" if True else "tea"]),
        ("Lunch", "12:30", ["tuna", "tort", "broc", "fruit", "tea" if (sleep_bad or metab) else "juice"]),
        ("Dinner", "18:30", ["chick", "spin" if bvit or F["bone"] else "veg", "lent", "turkey" if musc else ("mac" if salty_ok else "veg"), "tea"]),
        ("Snacks", "15:30", ["almond", "apricot"] + (["shake"] if (res or musc) and not hold else []) + ([] if metab else ["granola"])),
    ]
    if sleep_bad:
        notes.append("Coffee only at breakfast; herbal tea or water after midday.")
    if metab:
        notes.append("Sugary drinks swapped for water/tea; eat the protein part of each meal first.")
    if bvit:
        notes.append("Eye (SANS) flags: B-vitamin-rich foods (eggs, spinach, lentils, tuna) are included every day.")
    if F["anemia"]:
        notes.append("No iron supplements unless prescribed: iron stores rise in flight.")
    if not salty_ok:
        notes.append("Lower-salt choices: brisket and macaroni and cheese swapped out; skip extra salt packets.")

    stock = {}
    for it in supplies.items():
        if it.get("kind") == "Food" or it.get("category") == "Food":
            f = supplies.forecast(it)
            sub = it.get("sub") or ""
            stock[sub] = max(stock.get(sub, -1), 2 - f["st"]) if sub in stock else 2 - f["st"]
    meals, tk, tp = [], 0, 0
    for name, time_, keys in M:
        items = []
        for k in keys:
            n, cat, kc, pr, tags = FOODS[k]
            low = stock.get(cat, 2) <= 0
            items.append({"n": n, "cat": cat, "kcal": kc, "prot": pr, "low": low})
            tk += kc
            tp += pr
        meals.append({"meal": name, "time": time_, "items": items})
    # top up to the energy target with calorie-dense snacks
    extra = 0
    while tk < k_t - 150 and extra < 6:
        k = ["pb", "almond", "tort"][extra % 3]
        n, cat, kc, pr, tags = FOODS[k]
        meals[3]["items"].append({"n": n + " (extra)", "cat": cat, "kcal": kc, "prot": pr, "low": stock.get(cat, 2) <= 0})
        tk += kc
        tp += pr
        extra += 1
    for m in meals:
        m["kcal"] = sum(i["kcal"] for i in m["items"])
        m["prot"] = sum(i["prot"] for i in m["items"])
    if any(i["low"] for m in meals for i in m["items"]):
        notes.append("Some food categories are critically low in Supplies: swap those items for another category and check the resupply order.")

    return {"day": d, "env": RF.ENVS[env]["n"], "why": why, "avoid": avoid, "notes": notes,
            "exercise": {"title": title, "blocks": blocks, "total": total, "week": [w[0] for w in WEEK], "today_idx": int(math.floor(max(d, 0))) % 7, "hold": bool(hold)},
            "targets": targets, "meals": meals, "totals": {"kcal": tk, "prot": tp, "kcal_t": k_t, "prot_t": prot},
            "refs": [RF.REFS["english2020"], RF.REFS["smithzwart"], RF.REFS["smith2012"], RF.REFS["whitson2009"]]}
