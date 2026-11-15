"""Reference database for Vitals in the Void.

Loads the variables, conditions and environments that came from the team's spreadsheets
(Sheet-1 "Variables and conditions", Sheet-2 "Microgravity_Biomarkers-v2", the 11 formulas)
from reference_data.json, then adds:
  * the spacewalk (EVA) condition and its variables,
  * per-variable countermeasures with the supplies they need and their sources,
  * the formulas as Python functions.

Spec strings used in the data: 'r0.35' = +35 % of the personal baseline, 'a1.3' = +1.3 units.
"""
import json
from pathlib import Path

_raw = json.loads((Path(__file__).parent / "reference_data.json").read_text(encoding="utf-8"))
CONDS = _raw["CONDS"]
VARS = _raw["VARS"]
ENVS = _raw["ENVS"]
MISSIONS = _raw["MISSIONS"]
BODY = _raw["BODY"]
SYMPTOMS = _raw["SYMPTOMS"]
FXT = _raw["FXT"]

# ---------------------------------------------------------------- sources
REFS = {
    "hrp": "NASA Human Research Program, Human System Risk Board evidence reports (humanresearchroadmap.nasa.gov)",
    "std3001": "NASA-STD-3001 Spaceflight Human-System Standard, Vol. 1 Rev B (Crew Health) and Vol. 2",
    "medkit": "NASA ISS Medical Checklist 3.001 Medical Kit – Contents and Reference (2015)",
    "lee2020": "Lee AG et al. Spaceflight associated neuro-ocular syndrome (SANS) and the neuro-ophthalmologic effects of microgravity. npj Microgravity 2020",
    "zwart2016": "Zwart SR et al. Genotype, B-vitamin status and androgens affect spaceflight-induced ophthalmic changes. FASEB J 2016",
    "law2014": "Law J et al. Relationship between carbon dioxide levels and reported headaches on the ISS. J Occup Environ Med 2014",
    "mg2019": "Marshall-Goebel K et al. Assessment of jugular venous blood flow stasis and thrombosis during spaceflight. JAMA Netw Open 2019",
    "hughson2018": "Hughson RL et al. Cardiovascular regulation during long-duration spaceflights to the ISS. CMAJ 2018 / J Appl Physiol 2016",
    "smith2012": "Smith SM et al. Benefits for bone from resistance exercise and nutrition in long-duration spaceflight. J Bone Miner Res 2012",
    "leblanc2013": "LeBlanc A et al. Bisphosphonates as a supplement to exercise to protect bone during long-duration spaceflight. Osteoporos Int 2013",
    "whitson2009": "Whitson PA et al. Effect of potassium citrate therapy on the risk of renal stone formation during spaceflight. J Urol 2009",
    "barger2014": "Barger LK et al. Prevalence of sleep deficiency and use of hypnotic drugs in astronauts. Lancet Neurol 2014",
    "brainard2016": "Brainard GC et al. Solid-state lighting for the ISS: tests of visual performance and melatonin regulation. Acta Astronaut 2013/2016",
    "rosekind1995": "Rosekind MR et al. Alertness management: strategic naps in operational settings (NASA). J Sleep Res 1995",
    "english2020": "English KL et al. High-intensity training during spaceflight: results from the NASA SPRINT study. npj Microgravity 2020",
    "crucian2018": "Crucian BE et al. Immune system dysregulation during spaceflight: potential countermeasures for deep space exploration. Front Immunol 2018",
    "crucian2016": "Crucian B et al. Incidence of clinical symptoms during long-duration orbital spaceflight. Int J Gen Med 2016",
    "mehta2022": "Mehta SK et al. Dermatitis during spaceflight associated with HSV-1 reactivation. Viruses 2022",
    "trudel2022": "Trudel G et al. Hemolysis contributes to anemia during long-duration space flight. Nat Med 2022",
    "smithzwart": "Smith SM, Zwart SR, et al. Nutritional Biochemistry of Spaceflight / NASA nutrition requirements (Vitamin D 800 IU/d)",
    "ada": "American Diabetes Association Standards of Care: hypoglycaemia treatment, 15 g fast-acting carbohydrate and re-check in 15 min",
    "aha_bp": "AHA/ACC 2017 guideline for high blood pressure: measurement technique and thresholds",
    "who_ors": "WHO oral rehydration guidance; IOM water intake recommendations",
    "slack2016": "Slack KJ et al. Evidence report: Risk of adverse cognitive or behavioral conditions and psychiatric disorders. NASA HRP 2016",
    "cucinotta": "Cucinotta FA. Space radiation risks for astronauts on multiple ISS missions. PLoS One 2014; NASA SPE storm-shelter procedures",
    "eva2022": "Dunn J, Benson E, Norcross J, Newby N. Evidence Report: Risk of Injury and Compromised Performance due to EVA Operations. NASA 2022 (NTRS 20220004017)",
    "scheuring2009": "Scheuring RA et al. Musculoskeletal injuries and minor trauma in space: incidence and injury mechanisms in U.S. astronauts. Aviat Space Environ Med 2009",
    "opperman2010": "Opperman RA et al. Probability of spacesuit-induced fingernail trauma is associated with hand circumference. Aviat Space Environ Med 2010",
    "dcs": "NASA DCS severity criteria (Type I/II) and in-suit repressurization treatment; ISS 2-h prebreathe protocol design (NTRS 20000110097)",
    "lambertsen": "Lambertsen 1971; inspired CO₂ 1–5 % mild–moderate effects; EVA CO₂ washout termination criteria (NASA EVA evidence report 2022)",
    "aad": "American Academy of Dermatology clinical guidance (contact dermatitis, eczema, urticaria, tinea, folliculitis, herpes zoster)",
    "cdc_zoster": "CDC Clinical Overview of Shingles: start antivirals within 72 h of rash onset",
    "nice_cellulitis": "NICE NG141 Cellulitis and erysipelas: antimicrobial prescribing (2019)",
    "waao": "World Allergy Organization anaphylaxis guidance 2020: intramuscular epinephrine first line",
}

# ---------------------------------------------------------------- EVA (spacewalk) condition
CONDS.append({
    "id": "eva", "n": "Risk of injury and compromised performance from spacewalks (EVA)", "short": "Spacewalk (EVA)", "reg": "limbs",
    "haz": ["Hostile closed environment (suit)", "Altered gravity", "Distance from Earth"],
    "info": ("Spacewalks put the body inside a pressurised suit for 6–9 hours. The suit causes injuries: in the U.S. programme 50 of 219 "
             "in-flight injuries came from the suit, mostly hands (fingernail lifting, abrasions) and shoulders. The low suit pressure "
             "(about 4.3 psi) can cause decompression sickness (DCS) unless nitrogen is removed by an oxygen prebreathe. Carbon dioxide "
             "build-up, heat and fatigue reduce performance. Surface EVAs on the Moon or Mars add walking, falls and suit weight; NASA "
             "rates this a red risk for surface missions."),
    "act": ["Complete the full oxygen prebreathe protocol; never shorten it.",
            "Do a glove and suit fit check about a week before the EVA; use finger tape or liners on pressure points.",
            "Drink from the suit drink bag; report heat, headache or breathlessness early (possible CO₂ build-up).",
            "Plan no hard exercise on EVA days and at least 4–5 rest days between ISS EVAs; stretch shoulders and hands after.",
            "Keep up resistance training: strength protects shoulders and helps carry a suit in partial gravity.",
            "Report any joint pain, skin itching or mottling, numbness or weakness after the EVA at once (possible DCS)."],
    "esc": ("Any DCS symptom: stop, repressurise (in-suit or airlock) on 100 % oxygen and call the flight surgeon now. Numbness, weakness, "
            "confusion or vision change after EVA = neurological DCS: emergency. Suit CO₂ over 23 mmHg, core temperature over 39 °C or "
            "heart rate over 95 % of maximum: terminate or pause the EVA."),
    "ref": ["eva2022", "scheuring2009", "opperman2010", "dcs", "lambertsen"],
})
BODY["limbs"] = {"n": "Hands & shoulders (spacewalk)", "c": ["eva"],
                 "f": "Hands do fine work inside pressurised gloves; shoulders carry most of the load when working in the suit."}

def _V(id, n, u, c, inv, f, b, tol, s, l, **o):
    d = dict(id=id, n=n, u=u, c=c, inv=inv, f=f, b=b, tol=tol, s=s, l=l, dir="both", gs=1, dp=1, lim={}, on=5)
    d.update(o)
    return d

VARS.extend([
    _V("eva_prebreathe", "Prebreathe protocol completed", "%", ["eva"], 0, "eva", 100, 2, 0, 0, dp=0, dir="lo", gs=0,
       lim={"cl": 99.5}, how="Percent of the prescribed oxygen prebreathe actually completed before depress.", al=["prebreathe"]),
    _V("eva_co2", "Suit inspired CO₂", "mmHg", ["eva"], 0, "eva", 2, 3, 0, 0, dir="hi", gs=0, lim={"wh": 7.6, "ch": 23},
       how="Peak inspired CO₂ from suit telemetry during the EVA.", al=["suit co2", "co2"]),
    _V("eva_hrpct", "Peak EVA heart rate", "% of max", ["eva"], 0, "eva", 65, 10, 0, 0, dp=0, dir="hi", gs=0, lim={"wh": 85, "ch": 95},
       how="Peak heart rate during the EVA divided by age-predicted maximum (220 − age).", al=["eva heart rate"]),
    _V("eva_temp", "Peak core temperature in suit", "°C", ["eva"], 0, "eva", 37.4, 0.4, 0, 0, dir="hi", gs=0, lim={"wh": 38.3, "ch": 39.0},
       how="Core temperature sensor peak during the EVA.", al=["suit temperature"]),
    _V("eva_o2end", "Suit oxygen left at end", "%", ["eva"], 0, "eva", 40, 15, 0, 0, dp=0, dir="lo", gs=0, lim={"wl": 20, "cl": 10},
       how="Usable oxygen remaining at repress, from suit telemetry.", al=["oxygen remaining"]),
    _V("eva_hand", "Hand / finger pain after EVA", "/10", ["eva"], 0, "eva", 0, 1.2, 0, 0, dp=0, dir="hi", gs=0, lim={"wh": 3, "ch": 7},
       how="Pain score after glove removal, 0 = none.", al=["hand pain", "finger pain"]),
    _V("eva_nail", "Fingernail lifting (onycholysis)", "", ["eva"], 0, "eva", 0, 0.4, 0, 0, dp=0, dir="hi", gs=0, lim={"wh": 0.5},
       how="1 if any nail is lifting or bruised under the nail after the EVA.", al=["fingernail", "nail"]),
    _V("eva_shoulder", "Shoulder pain after EVA", "/10", ["eva"], 0, "eva", 0, 1.2, 0, 0, dp=0, dir="hi", gs=0, lim={"wh": 3, "ch": 7},
       how="Pain score, worse side, 0 = none.", al=["shoulder pain"]),
    _V("eva_dcs", "Decompression sickness signs", "grade", ["eva"], 0, "eva", 0, 0.3, 0, 0, dp=0, dir="hi", gs=0, lim={"ch": 0.5},
       how="0 = none; 1 = joint pain, skin itch or mottling; 2 = numbness, weakness, confusion or vision change.", al=["decompression", "dcs", "bends"]),
    _V("eva_hours7", "EVA hours in last 7 days", "h", ["eva"], 0, "eva", 6, 12, 0, 0, dir="hi", gs=0, lim={"wh": 24, "ch": 32},
       how="Total suited EVA time in the past week (exploration plans allow up to 24 h).", al=["eva hours"]),
    _V("eva_rest", "Rest days since previous EVA", "d", ["eva"], 0, "eva", 7, 10, 0, 0, dp=0, dir="lo", gs=0, lim={"wl": 4, "cl": 1},
       how="Days since the previous EVA (ISS practice: at least 4–5).", al=["rest days"]),
])
SYMPTOMS.extend([
    ["joint", "Joint pain after EVA", ["eva"], 2], ["mottle", "Skin itch / mottling after EVA", ["eva"], 2],
    ["numb", "Numbness, weakness or confusion after EVA", ["eva"], 2],
    ["nails", "Fingernail lifting or bruising", ["eva"], 1], ["shoulder", "Shoulder pain", ["eva", "muscle"]],
])
for c in CONDS:
    c.setdefault("ref", [])
_CREF = {"sans": ["lee2020", "zwart2016", "law2014"], "cv": ["hughson2018", "std3001"], "bone": ["smith2012", "leblanc2013", "whitson2009"],
         "sleep": ["barger2014", "brainard2016", "rosekind1995"], "fluid": ["mg2019", "lee2020"], "muscle": ["english2020", "smith2012"],
         "metab": ["hughson2018", "ada"], "immune": ["crucian2018", "crucian2016"], "skin": ["crucian2016", "mehta2022", "aad"],
         "rad": ["cucinotta", "std3001"], "anemia": ["trudel2022"], "vasc": ["hughson2018"], "nutr": ["smithzwart"], "endo": ["slack2016"],
         "lytes": ["who_ors", "whitson2009"], "hypox": ["std3001", "medkit"], "behav": ["slack2016"]}
for c in CONDS:
    if not c["ref"]:
        c["ref"] = _CREF.get(c["id"], ["hrp"])

# ---------------------------------------------------------------- measurement frequency
# Non-invasive measures are scheduled by importance and how quick the method is (daily / every 2 days / every 3 days);
# invasive lab tests (blood draws) are weekly.
FREQ = {
    # daily: quick self-tests or wearable-derived
    "amsler": "daily", "qtc": "daily", "pvc": "daily", "rem": "daily", "pvt": "daily",
    # every 2 days: short device measurements
    "vis": "d2", "pv": "d2", "sv": "d2", "co": "d2", "force": "d2", "lean": "d2", "mass": "d2", "pwv": "d2",
    "scort": "d2", "ohdg": "d2", "etco": "d2",
    # every 3 days: ultrasound/tonometry or 24-h collections
    "iop": "d3", "onsd": "d3", "trt": "d3", "cvp": "d3", "ijv": "d3", "ijvf": "d3", "mcsa": "d3", "ucal": "d3", "uox": "d3", "viral": "d3",
}
FREQ_LABEL = {"cont": "Continuous (wearable)", "daily": "Daily", "d2": "Every 2 days", "d3": "Every 3 days", "weekly": "Weekly (lab)", "calc": "Calculated", "eva": "Each spacewalk"}
for v in VARS:
    if v["id"] in FREQ:
        v["f"] = FREQ[v["id"]]
    elif v["inv"] and v["f"] == "biweekly":
        v["f"] = "weekly"
    v["al"] = list(v.get("al", []))

VM = {v["id"]: v for v in VARS}
CM = {c["id"]: c for c in CONDS}

# ---------------------------------------------------------------- formulas
def _f10(g, B, P):
    c = g("cort") / B("cort") if g("cort") is not None else g("scort") / B("scort")
    return B("prle") * c * min(2, B("sleep") / max(1, g("sleep")))

FX = {
    "F1": lambda g, B, P: B("icp") * g("onsd") / B("onsd"),
    "F2": lambda g, B, P: B("pnif") * (1 - P["k2"] * g("shift") / 2.0),
    "F3": lambda g, B, P: B("emg") * g("mcsa") / B("mcsa"),
    "F4": lambda g, B, P: B("tewl") * g("osm") / B("osm"),
    "F5": lambda g, B, P: B("skhyd") - 4 * g("shift") + 3 * (g("ctemp") - B("ctemp")),
    "F5b": lambda g, B, P: B("skph") * g("na") / B("na"),
    "F6": lambda g, B, P: B("ery") * (1 + g("@dose") / 1500),
    "F7": lambda g, B, P: B("mda") * g("ohdg") / B("ohdg"),
    "F9": lambda g, B, P: B("fmd") * B("pwv") / g("pwv"),
    "F10": _f10,
    "F11": lambda g, B, P: B("pha") * (g("mcsa") / B("mcsa")) * (1 - g("shift") / (0.6 * B("mass"))),
    "MCV": lambda g, B, P: g("hct") * 10 / g("rbc"),
    "MCH": lambda g, B, P: g("hgb") * 10 / g("rbc"),
    "MCHC": lambda g, B, P: g("hgb") * 100 / g("hct"),
    "HOMA": lambda g, B, P: g("glu") * g("ins") / 405,
}
FX_BY_VAR = {FXT[k]["v"]: k for k in FX if FXT.get(k, {}).get("v")}

# ---------------------------------------------------------------- assessment panels, routine tasks
PANELS = [
    {"id": "exam", "n": "Eye & heart exam", "v": ["iop", "onsd", "trt", "vis", "qtc", "pvc", "sv", "co", "pwv"]},
    {"id": "bone", "n": "Bone & calcium", "v": ["ica", "ctx", "ntx", "bmd", "ucal", "uox"]},
    {"id": "heme", "n": "Blood count & hemolysis", "v": ["hct", "hgb", "rbc", "retic", "hapto", "ldh", "etco"]},
    {"id": "metab", "n": "Metabolic", "v": ["glu", "ins", "ldl"]},
    {"id": "immune", "n": "Immune", "v": ["alc", "tnk", "il6", "tnf", "viral"]},
    {"id": "rad", "n": "Radiation biodosimetry", "v": ["h2ax", "ohdg"]},
    {"id": "nutr", "n": "Nutrition", "v": ["vitd", "ferr", "iron", "b12", "vitc"]},
    {"id": "lytes", "n": "Electrolytes", "v": ["na", "k", "cl", "mg", "osm"]},
    {"id": "endo", "n": "Endocrine & circadian", "v": ["cort", "acth", "prl", "tsh", "ft4", "ft3", "gh", "dlmo"]},
    {"id": "vasc", "n": "Endothelial", "v": ["vwf", "icam", "vcam"]},
    {"id": "eva", "n": "Spacewalk debrief", "v": ["eva_prebreathe", "eva_co2", "eva_hrpct", "eva_temp", "eva_o2end", "eva_hand", "eva_nail", "eva_shoulder", "eva_dcs", "eva_hours7", "eva_rest"]},
]
TASKS = [
    {"id": "vit", "n": "Morning vitals (BP, HR, temperature)", "v": ["sbp"], "p": 1, "xp": 10},
    {"id": "ecg", "n": "30-s wearable ECG", "v": ["qtc"], "p": 1, "xp": 10},
    {"id": "slp", "n": "Sleep log", "v": ["sleep"], "p": 1, "xp": 10},
    {"id": "moo", "n": "Mood & stress check-in", "v": ["mood", "stress"], "p": 1, "xp": 10},
    {"id": "eat", "n": "Log meals (energy intake)", "v": ["kcal"], "p": 1, "xp": 10},
    {"id": "h2o", "n": "Hydration: urine specific gravity", "v": ["usg"], "p": 1, "xp": 10},
    {"id": "ex", "n": "Exercise ≥ 90 min", "v": ["exer"], "p": 1, "xp": 15, "min": 90},
    {"id": "eye", "n": "Amsler grid vision check", "v": ["amsler"], "p": 1, "xp": 10},
    {"id": "pvt", "n": "Reaction test (PVT)", "v": ["pvt"], "p": 1, "xp": 15},
    {"id": "jrn", "n": "Private journal entry", "v": ["@journal"], "p": 1, "xp": 10},
    {"id": "mass", "n": "Body mass & composition", "v": ["mass", "lean"], "p": 2, "xp": 20},
    {"id": "near", "n": "Near-vision card", "v": ["vis"], "p": 2, "xp": 15},
    {"id": "str", "n": "Strength test", "v": ["force"], "p": 2, "xp": 20},
    {"id": "card", "n": "Heart & vessels (stroke volume, pulse-wave velocity)", "v": ["sv", "pwv"], "p": 2, "xp": 20},
    {"id": "smp", "n": "Saliva, breath & urine strip", "v": ["scort", "etco", "ohdg"], "p": 2, "xp": 20},
    {"id": "us", "n": "Eye & neck ultrasound (ONSD, jugular)", "v": ["onsd", "ijv"], "p": 3, "xp": 30},
    {"id": "iop", "n": "Eye pressure (tonometry)", "v": ["iop"], "p": 3, "xp": 20},
    {"id": "msc", "n": "Muscle ultrasound", "v": ["mcsa"], "p": 3, "xp": 20},
    {"id": "uri", "n": "24-h urine & saliva PCR", "v": ["ucal", "viral"], "p": 3, "xp": 25},
    {"id": "blood", "n": "Blood draw: lab panel", "v": ["ica", "hct", "ctx"], "p": 7, "xp": 60},
]

# Sheet-2 rows as given (for the Reference screen)
S2 = [["Ocular & Neuro-Ocular","Optic Nerve Sheath Diameter (ONSD)","4.64–5.8 mm","Baseline","7.2 ± 1.5 mm","Lee et al. (2020); NASA SANS"],["Ocular & Neuro-Ocular","Retinal Thickness (TRT)","~91 ± 8 µm","Baseline","+19.4 to ≥55 µm","Macias et al. (2020)"],["Ocular & Neuro-Ocular","Visual Acuity","20/20","23–29% deficit","48–60% deficit (+0.50 to +2.00 D)","Mader et al. (2011)"],["Ocular & Neuro-Ocular","Intraocular Pressure (IOP)","10–21 mmHg","+20–50%","+~1.3 mmHg","Greenwald et al. (2021)"],["Cardiovascular","Total Plasma / Blood Volume","~5 L (plasma ~3 L)","−10 to −15%","−10 to −15%","Norsk (2020)"],["Cardiovascular","Heart Rate (HR) & HRV","60–100 bpm","HR stable / HRV ↓","HR stable / HRV ↓","Baevsky et al. (2007)"],["Cardiovascular","ECG / EKG","QTc < 440 ms","Stable","PVCs ↑","D'Aunno et al. (2003)"],["Cardiovascular","SpO2","97–99%","No change","No change","Team"],["Cardiovascular","Stroke Volume (SV) & Cardiac Output","SV 60–100 mL; CO 4–8 L/min","SV ↑; CO ↑","SV −15%; CO baseline","Norsk (2020)"],["Cardiovascular","Blood Pressure (MAP)","120/80 mmHg","Stable","Stable / elevated","Norsk (2020)"],["Cardiovascular","Central Venous Pressure (CVP)","2–8 mmHg","1–2 mmHg","< 2 mmHg","Buckey et al. (1996)"],["Bone & Mineral","Bone Mineral Density (BMD)","T-score > −1.0","−0%","−1 to −1.5% / month","Sibonga (2013)"],["Bone & Mineral","Urinary Calcium & Oxalate","100–300 mg/day","> 300 mg/day","Elevated","Smith et al. (2014)"],["Bone & Mineral","Bone Turnover (CTX, NTX)","Balanced","Elevated","+50–100%","Smith et al. (2012)"],["Bone & Mineral","Serum Ionized Calcium","4.5–5.6 mg/dL","> 5.6 mg/dL","High-normal","Smith et al. (2012)"],["Sleep","Actigraphy","~8 h","~6 h","5.96 h","Barger et al. (2014)"],["Sleep","Polysomnography (PSG)","20% REM, 20% N3","< 20% REM/N3","< 20% REM/N3","Dijk et al. (2001)"],["Sleep","Core Body Temp","Normal","Dampened","+~1 °C","Stahn et al. (2017)"],["Fluid Shifts","Upper Body Fluid Shift","Normal","+1.5 to 2.0 L","+1.5 to 2.0 L","Norsk (2020)"],["Fluid Shifts","Jugular Vein CSA","Low","High (engorged)","High","Marshall-Goebel (2019)"],["Musculoskeletal","Muscle Volume / CSA","100%","−5%","−10 to −20%","Fitts et al. (2010)"],["Musculoskeletal","Peak Isometric Force","100%","Minor ↓","−20 to −30%","Fitts et al. (2010)"],["Metabolism","Fasting Insulin & HOMA-IR","HOMA-IR < 2.0","Spikes","HOMA-IR > 2.0","Hughson et al. (2017)"],["Metabolism","Circulating Lipids (LDL)","< 100 mg/dL","Fluctuating","> 100 mg/dL","Garrett-Bakelman (2019)"],["Metabolism","Cortisol / ACTH","Diurnal","Elevated","Elevated","Crucian et al. (2014)"],["Immunology","Viral DNA Shedding","0","Elevated","~50% prevalence","Rooney et al. (2019)"],["Immunology","Cytokines","Balanced Th1/Th2","IL-6 ↑","Th2 dominant","Crucian et al. (2014)"],["Immunology","T-Cell & NK Cell Activity","100%","↓","↓","Crucian et al. (2015)"],["Radiation","Absorbed Dose Rate","~3 mSv/year","~0.5–1.0 mSv/day","~75–150 mSv / 6 mo","Cucinotta (2014)"],["Radiation","DNA Damage (8-OHdG)","Baseline","ROS ↑","Elevated","Garrett-Bakelman (2019)"],["Hematology","RBC, Hemoglobin, Hematocrit","Hct ~45%","Hct > 45%","RBC mass −10%","Trudel et al. (2022)"],["Hematology","Pulse Wave Velocity (PWV)","Normal","Stable","PWV ↑ (stiffness)","Hughson et al. (2016)"],["Nutrition","Caloric Intake","~2500–3000 kcal/day","Reduced","70–80% of requirement","Smith et al. (2012)"],["Nutrition","Electrolytes & Osmolality","~285 mOsm/kg","Urine output ↑","Serum Na⁺ ↓","Norsk (2020)"]]
