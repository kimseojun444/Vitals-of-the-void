"""Rash check: photo measurements + structured symptom questions -> ranked likely rash types, causes and care.

How it works (no AI yet):
 1. The photo is measured with standard image processing: quality (focus, light), how red the affected skin is
    compared with the skin around it (erythema index, log10 R/G), and how much of the frame is affected.
    Comparing with the astronaut's previous rash photos shows whether it is spreading.
 2. A short dermatology questionnaire (where, what it looks like, how it feels, onset, exposures) is scored against
    the morphology, distribution and history patterns of the rashes most often seen in spaceflight and in the
    spacesuit/cabin environment (dermatology clinical guidance: AAD, CDC, NICE; spaceflight data: Crucian 2016, Mehta 2022,
    NASA EVA evidence report 2022).
 3. Red-flag rules run first and override everything (anaphylaxis, possible shingles, spreading infection, purpura,
    neurological DCS skin signs).
The result is decision support for the astronaut and the flight surgeon, not a diagnosis.
ai/hooks.py has a place for a trained image classifier to add a photo-based opinion later.
"""
import io
import math

import numpy as np
from PIL import Image, ImageFilter

QUESTIONS = [
    {"id": "where", "q": "Where is the rash?", "multi": True, "opts": [
        ["face", "Face"], ["scalp", "Scalp / hairline"], ["lips", "Lips or mouth"], ["hands", "Hands / fingers"], ["nails", "Around or under nails"],
        ["arms", "Arms"], ["trunk", "Chest, back or belly"], ["folds", "Skin folds (armpit, groin)"], ["feet", "Feet / between toes"],
        ["legs", "Legs"], ["adhesive", "Where sensors, tape or electrodes sit"], ["band", "A band on one side of the body"], ["wide", "Widespread"]]},
    {"id": "look", "q": "What does it look like?", "multi": True, "opts": [
        ["red", "Red patches"], ["dry", "Dry, scaly or flaky"], ["cracks", "Cracked skin"], ["papules", "Small raised red bumps"],
        ["vesicles", "Tiny blisters / weeping"], ["grouped", "Clusters of blisters on red skin"], ["crust", "Yellow / honey-coloured crusts"],
        ["pustules", "Pus spots around hairs"], ["wheals", "Raised welts that move within hours"], ["ring", "Ring shape with clearer centre"],
        ["pinpoint", "Pinpoint clear or red bumps after sweating"], ["shape", "Sharp edges matching what touched the skin"],
        ["swollen", "Swollen, hot, spreading redness"], ["purple", "Purple dots or bruise-like, does not fade when pressed"],
        ["greasy", "Greasy yellowish scale"], ["nail", "Nail lifting or dark under nail"], ["abrasion", "Rubbed raw / abrasion"], ["mottled", "Blotchy, marbled skin"]]},
    {"id": "feel", "q": "How does it feel?", "multi": True, "opts": [
        ["itch", "Itchy"], ["burn", "Burning or painful"], ["prodrome", "Pain or tingling came before the rash"], ["tender", "Tender and warm"], ["none", "No symptoms"]]},
    {"id": "onset", "q": "How quickly did it appear?", "multi": False, "opts": [
        ["minutes", "Minutes to hours"], ["days", "Over 1–3 days"], ["weeks", "Weeks, or it keeps coming back"]]},
    {"id": "general", "q": "Anything else?", "multi": True, "opts": [
        ["fever", "Fever or chills"], ["spreading", "Spreading quickly"], ["swelling_face", "Swelling of lips, eyes or face"],
        ["breathing", "Trouble breathing or swallowing"], ["unwell", "Feeling generally unwell"], ["eye", "Rash near the eye or eye pain"], ["neuro", "Numbness or weakness"]]},
    {"id": "exposure", "q": "Recent exposures (last 2 weeks)", "multi": True, "opts": [
        ["product", "New soap, wipe, lotion or detergent"], ["sensor", "Adhesive sensors, tape or electrodes"], ["med", "Started a new medicine"],
        ["sweat", "Heavy sweating (exercise, suit)"], ["eva", "Spacewalk / glove use"], ["dose", "Radiation dose spike"], ["coldsores", "History of cold sores"],
        ["chickenpox", "Had chickenpox before"], ["shared", "Shared equipment or towels"], ["allergy", "Known allergies / eczema"], ["dryair", "Very dry cabin air"]]},
]

DX = {
 "acd": {"n": "Allergic contact dermatitis", "w": {"red": 2, "vesicles": 2, "shape": 3, "itch": 3, "adhesive": 2, "hands": 1, "face": 1, "days": 2, "product": 3, "sensor": 3, "allergy": 1},
         "what": "An immune reaction to something that touched the skin (adhesive, nickel, fragrance, preservative in wipes).",
         "cause": "Electrode/tape adhesives, rinse-free soaps and wipes, gloves and new materials on board.",
         "care": ["Identify and stop the trigger; swap to hypoallergenic tape or move sensor sites.", "Hydrocortisone 1 % twice daily for up to 7 days on non-facial skin.", "Non-sedating antihistamine for itch; emollient after washing."],
         "sup": ["hydrocortisone", "antihistamine", "emollient"], "ref": ["aad", "crucian2016"],
         "esc": "Spreading beyond the contact area, face/eyelids involved, or no better in 7 days: flight surgeon (oral steroid may be needed)."},
 "icd": {"n": "Irritant contact dermatitis", "w": {"red": 2, "dry": 2, "cracks": 2, "burn": 2, "hands": 2, "adhesive": 2, "shape": 1, "product": 2, "sensor": 2, "sweat": 1, "dryair": 1},
         "what": "Direct damage to the skin barrier from friction, moisture, cleansers or adhesive removal.",
         "cause": "Repeated wipes and rinse-free soap, occlusion under tape or gloves, dry cabin air.",
         "care": ["Stop or reduce the irritant; pat dry, do not rub.", "Thick emollient several times a day; barrier film before re-taping.", "Hydrocortisone 1 % for a few days if inflamed."],
         "sup": ["emollient", "hydrocortisone"], "ref": ["aad"], "esc": "Broken skin with pus or spreading redness: flight surgeon."},
 "xer": {"n": "Dry-skin (xerotic) eczema", "w": {"dry": 3, "cracks": 2, "itch": 2, "legs": 1, "arms": 1, "hands": 1, "weeks": 2, "dryair": 3, "allergy": 1},
         "what": "Dry, itchy, scaly skin from a damaged moisture barrier.",
         "cause": "Low cabin humidity, limited washing, skin thinning and immune changes in flight.",
         "care": ["Emollient twice daily, especially after washing.", "Lukewarm, brief cleansing; gentle soap substitute.", "Hydrocortisone 1 % on inflamed patches for up to 7 days."],
         "sup": ["emollient", "hydrocortisone"], "ref": ["aad", "crucian2016"], "esc": "Cracks that bleed or get infected: flight surgeon."},
 "urt": {"n": "Hives (urticaria) / hypersensitivity", "w": {"wheals": 4, "itch": 3, "minutes": 3, "wide": 1, "red": 1, "med": 2, "allergy": 2, "product": 1},
         "what": "Itchy raised welts from histamine release; each welt fades within 24 h.",
         "cause": "Allergic or non-allergic triggers; hypersensitivity events are among the most reported on the ISS.",
         "care": ["Non-sedating antihistamine (loratadine or cetirizine); may repeat daily.", "Stop any new medicine or product and tell the flight surgeon.", "Cool compress for itch."],
         "sup": ["antihistamine", "diphenhydramine"], "ref": ["aad", "waao", "crucian2016"],
         "esc": "Lip, tongue or throat swelling, wheeze or faintness = anaphylaxis: epinephrine now and CMO."},
 "zos": {"n": "Shingles (herpes zoster, VZV reactivation)", "w": {"band": 5, "grouped": 3, "vesicles": 2, "prodrome": 4, "burn": 2, "days": 1, "chickenpox": 2, "trunk": 1, "face": 1},
         "what": "Reactivated chickenpox virus causing a painful band of blisters on one side.",
         "cause": "Spaceflight stress weakens T-cell control; VZV is shed by many crew and risk rises with mission length.",
         "care": ["Start antiviral (valacyclovir) per flight surgeon — best within 72 h of rash onset.", "Keep the rash covered; avoid sharing towels.", "Pain relief per flight surgeon."],
         "sup": ["valacyclovir", "acetaminophen", "bandage"], "ref": ["cdc_zoster", "crucian2018", "mehta2022"],
         "esc": "Contact the flight surgeon today. Near the eye or tip of the nose: urgent (eye involvement)."},
 "hsv": {"n": "Herpes simplex (cold sore / herpetic dermatitis)", "w": {"grouped": 3, "vesicles": 2, "lips": 4, "face": 2, "prodrome": 2, "burn": 1, "coldsores": 4, "crust": 1},
         "what": "Reactivated HSV-1: tingling, then small grouped blisters that crust.",
         "cause": "Stress-related immune changes; HSV-1 dermatitis has been confirmed during long-duration flight.",
         "care": ["Antiviral cream or tablets per flight surgeon at the first tingle.", "Do not touch eyes after touching sores; wash hands.", "Avoid sharing drink bags."],
         "sup": ["acyclovir_cream", "valacyclovir", "abhr"], "ref": ["mehta2022", "crucian2018"], "esc": "Eye pain or redness, or widespread blisters: flight surgeon now."},
 "fol": {"n": "Folliculitis", "w": {"pustules": 4, "papules": 2, "trunk": 1, "legs": 1, "folds": 1, "sweat": 2, "itch": 1, "days": 1, "shared": 1},
         "what": "Inflamed hair follicles, usually from bacteria under occlusion and sweat.",
         "cause": "Sweating during exercise and in the suit, tight garments, shaving.",
         "care": ["Keep the area clean and dry; change garments after exercise.", "Antiseptic wash; topical antibiotic on a few spots per flight surgeon.", "Avoid shaving the area for a week."],
         "sup": ["topical_abx", "abhr"], "ref": ["aad"], "esc": "Boils, spreading redness or fever: flight surgeon."},
 "tin": {"n": "Fungal infection (tinea)", "w": {"ring": 5, "dry": 1, "itch": 2, "folds": 2, "feet": 3, "weeks": 1, "days": 1, "sweat": 2, "shared": 1},
         "what": "A skin fungus giving itchy, ring-shaped scaly patches.",
         "cause": "Warm, moist skin in socks, folds and garments; shared equipment.",
         "care": ["Antifungal cream twice daily for 2 weeks, continuing 1 week after it clears.", "Keep skin dry; separate towels."],
         "sup": ["antifungal"], "ref": ["aad"], "esc": "No improvement in 2 weeks or on scalp/nails: flight surgeon."},
 "cel": {"n": "Skin infection (cellulitis / impetigo)", "w": {"swollen": 5, "tender": 3, "crust": 3, "fever": 3, "spreading": 3, "unwell": 2, "abrasion": 1, "cracks": 1},
         "what": "Bacterial infection of the skin; honey crusts suggest impetigo, hot spreading redness suggests cellulitis.",
         "cause": "Bacteria entering through cracks, abrasions or insect-free but altered cabin microbiome; immune changes.",
         "care": ["Mark the edge of the redness with a pen to track spread.", "Topical antibiotic for small impetigo; oral antibiotic per flight surgeon for cellulitis.", "Rest, raise the area, fluids."],
         "sup": ["topical_abx", "oral_abx", "bandage"], "ref": ["nice_cellulitis", "aad"], "esc": "Spreading redness, fever or feeling unwell: flight surgeon today."},
 "mil": {"n": "Heat rash (miliaria)", "w": {"pinpoint": 5, "sweat": 3, "trunk": 1, "folds": 1, "itch": 1, "minutes": 1, "days": 1},
         "what": "Blocked sweat ducts giving tiny clear or red bumps.",
         "cause": "Sweat trapped under garments during exercise or in the suit's cooling garment.",
         "care": ["Cool the skin; loose dry clothing.", "Avoid heavy creams on the area; it usually settles in days."],
         "sup": [], "ref": ["aad"], "esc": "Pus spots or fever: flight surgeon."},
 "drug": {"n": "Drug eruption", "w": {"wide": 3, "red": 2, "papules": 2, "trunk": 1, "itch": 1, "days": 2, "med": 5},
          "what": "A widespread rash appearing 4–14 days after starting a medicine.",
          "cause": "Antibiotics, anticonvulsants, NSAIDs and others.",
          "care": ["Tell the flight surgeon which medicine you started; do not stop prescribed drugs without advice.", "Antihistamine for itch."],
          "sup": ["antihistamine"], "ref": ["aad"], "esc": "Blisters, peeling, mouth sores or fever: emergency (severe drug reaction)."},
 "seb": {"n": "Seborrhoeic dermatitis", "w": {"greasy": 4, "scalp": 3, "face": 2, "dry": 1, "red": 1, "weeks": 2, "itch": 1},
         "what": "Flaky, greasy, red skin on the scalp, eyebrows and sides of the nose.",
         "cause": "Yeast overgrowth with limited hair washing and stress.",
         "care": ["Antifungal cream to face; medicated shampoo if available.", "Mild hydrocortisone for short flares."],
         "sup": ["antifungal", "hydrocortisone"], "ref": ["aad"], "esc": "Not settling in 2–3 weeks: flight surgeon."},
 "eva": {"n": "Suit pressure / friction injury", "w": {"abrasion": 4, "nail": 4, "hands": 2, "nails": 3, "red": 1, "burn": 1, "eva": 5},
         "what": "Rubbing and pressure from the glove or suit: abrasions, bruising, fingernail lifting.",
         "cause": "Glove fit, hand size and long suited time (NASA EVA evidence report).",
         "care": ["Clean and cover abrasions; keep nails short and taped.", "Cold pack for pain; glove-fit check before the next EVA."],
         "sup": ["bandage", "finger_tape", "cold_pack"], "ref": ["eva2022", "opperman2010"], "esc": "Signs of infection under a nail, or numbness: flight surgeon."},
 "rad": {"n": "Radiation skin reaction", "w": {"red": 2, "burn": 2, "dose": 6, "wide": 1, "days": 1},
         "what": "Redness and burning after a very large dose (only after a major solar particle event).",
         "cause": "High skin dose during a solar particle event outside shelter.",
         "care": ["Gentle emollient; avoid friction.", "Record dose history for the radiation team."],
         "sup": ["emollient"], "ref": ["cucinotta"], "esc": "Any skin reaction after a dose spike: flight surgeon and radiation team now."},
}


def analyse_image(data: bytes, previous=None):
    img = Image.open(io.BytesIO(data)).convert("RGB")
    s = min(1.0, 600 / max(img.size))
    img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))))
    a = np.asarray(img).astype(np.float64) + 1.0
    R, G = a[..., 0], a[..., 1]
    ei = 100 * np.log10(R / G)  # erythema index per pixel
    gray = np.asarray(img.convert("L")).astype(np.float64)
    lap = np.asarray(img.convert("L").filter(ImageFilter.FIND_EDGES)).astype(np.float64)
    sharp = float(lap.var())
    bright = float(gray.mean())
    skin_ref = float(np.percentile(ei, 30))
    thr = skin_ref + max(4.0, float(np.std(ei)) * 0.8)
    mask = ei > thr
    frac = float(mask.mean())
    lesion_ei = float(ei[mask].mean()) if mask.any() else skin_ref
    contrast = lesion_ei - skin_ref
    q = []
    if bright < 60:
        q.append("Photo is dark: use more light.")
    if bright > 220:
        q.append("Photo is over-exposed.")
    if sharp < 60:
        q.append("Photo looks blurred: hold steady and focus.")
    out = {"erythema_contrast": round(contrast, 1), "affected_fraction": round(frac * 100, 1), "sharpness": round(sharp, 1),
           "brightness": round(bright, 1), "quality": q, "redness": "marked" if contrast > 15 else "moderate" if contrast > 7 else "mild"}
    if previous:
        p = previous
        out["change_area"] = round(out["affected_fraction"] - p.get("affected_fraction", 0), 1)
        out["change_redness"] = round(contrast - p.get("erythema_contrast", 0), 1)
        out["spreading"] = out["change_area"] > 5 or out["change_redness"] > 5
    return out


# Words in the astronaut's own description (typed or spoken) mapped to questionnaire features
TEXT_MAP = [
    ("face", "face"), ("cheek", "face"), ("forehead", "face"), ("scalp", "scalp"), ("hairline", "scalp"), ("lip", "lips"), ("mouth", "lips"),
    ("hand", "hands"), ("finger", "hands"), ("nail", "nails"), ("arm", "arms"), ("elbow", "arms"), ("chest", "trunk"), ("back", "trunk"),
    ("belly", "trunk"), ("stomach", "trunk"), ("armpit", "folds"), ("groin", "folds"), ("fold", "folds"), ("foot", "feet"), ("feet", "feet"),
    ("toe", "feet"), ("leg", "legs"), ("thigh", "legs"), ("electrode", "adhesive"), ("sensor", "adhesive"), ("tape", "adhesive"),
    ("one side", "band"), ("band", "band"), ("stripe", "band"), ("all over", "wide"), ("everywhere", "wide"), ("widespread", "wide"),
    ("red", "red"), ("dry", "dry"), ("flak", "dry"), ("scal", "dry"), ("peel", "dry"), ("crack", "cracks"), ("bump", "papules"), ("pimple", "papules"),
    ("blister", "vesicles"), ("weep", "vesicles"), ("ooz", "vesicles"), ("cluster", "grouped"), ("crust", "crust"), ("honey", "crust"),
    ("pus", "pustules"), ("whitehead", "pustules"), ("welt", "wheals"), ("hive", "wheals"), ("ring", "ring"), ("circle", "ring"),
    ("tiny bumps", "pinpoint"), ("prickly", "pinpoint"), ("sharp edge", "shape"), ("outline", "shape"), ("swell", "swollen"), ("hot", "swollen"),
    ("spreading", "spreading"), ("purple", "purple"), ("bruise", "purple"), ("greasy", "greasy"), ("oily", "greasy"), ("raw", "abrasion"),
    ("rub", "abrasion"), ("blotch", "mottled"), ("marbl", "mottled"), ("itch", "itch"), ("burn", "burn"), ("sting", "burn"), ("pain", "burn"),
    ("sore", "burn"), ("tingl", "prodrome"), ("tender", "tender"), ("warm", "tender"), ("minute", "minutes"), ("suddenly", "minutes"),
    ("hour", "minutes"), ("few days", "days"), ("yesterday", "days"), ("week", "weeks"), ("keeps coming back", "weeks"), ("fever", "fever"),
    ("chill", "fever"), ("unwell", "unwell"), ("sick", "unwell"), ("breath", "breathing"), ("swallow", "breathing"), ("eye", "eye"),
    ("numb", "neuro"), ("weak", "neuro"), ("soap", "product"), ("wipe", "product"), ("lotion", "product"), ("detergent", "product"),
    ("new medicine", "med"), ("new medication", "med"), ("started taking", "med"), ("sweat", "sweat"), ("workout", "sweat"), ("exercise", "sweat"),
    ("spacewalk", "eva"), ("eva", "eva"), ("glove", "eva"), ("radiation", "dose"), ("flare", "dose"), ("cold sore", "coldsores"),
    ("chickenpox", "chickenpox"), ("towel", "shared"), ("shared", "shared"), ("allerg", "allergy"), ("eczema", "allergy"), ("dry air", "dryair")]
NEG = ("no ", "not ", "without ", "don't ", "dont ", "isn't ", "never ")


def features_from_text(text):
    t = " " + (text or "").lower() + " "
    found = set()
    for w, f in TEXT_MAP:
        i = t.find(w)
        while i >= 0:
            before = t[max(0, i - 12):i]
            if not any(n in before for n in NEG):
                found.add(f)
                break
            i = t.find(w, i + 1)
    if "swelling" in t and ("lip" in t or "face" in t or "eye" in t or "throat" in t):
        found.add("swelling_face")
    return found


def assess(answers: dict, img: dict | None, notes: dict | None = None):
    sel = set()
    from_text = set()
    for txt in (notes or {}).values():
        from_text |= features_from_text(txt)
    for k, v in (answers or {}).items():
        if isinstance(v, list):
            sel.update(v)
        elif v:
            sel.add(v)
    answered = set(sel)
    sel |= from_text
    flags = []
    if {"breathing", "swelling_face"} & sel:
        flags.append({"lvl": 2, "t": "Possible anaphylaxis", "do": "Use the epinephrine auto-injector now, lie flat (legs up unless breathing is hard), oxygen, and call the CMO. Antihistamine is not enough on its own."})
    if "neuro" in sel or ("mottled" in sel and "eva" in sel):
        flags.append({"lvl": 2, "t": "Possible decompression sickness (skin or neurological)", "do": "If after an EVA: 100 % oxygen, repressurise per protocol and call the flight surgeon now."})
    if "purple" in sel:
        flags.append({"lvl": 2, "t": "Purple non-fading spots (purpura)", "do": "Can signal low platelets or serious infection: contact the flight surgeon now; blood count."})
    if ("fever" in sel or "unwell" in sel) and ({"swollen", "spreading", "tender"} & sel):
        flags.append({"lvl": 2, "t": "Possible spreading skin infection", "do": "Mark the edge of the redness and contact the flight surgeon today for antibiotics."})
    if "band" in sel and ({"grouped", "vesicles", "prodrome"} & sel):
        flags.append({"lvl": 2 if "eye" in sel or "face" in sel else 1, "t": "Possible shingles", "do": "Antivirals work best within 72 h: contact the flight surgeon today." + (" Near the eye: urgent." if "eye" in sel else "")})
    if img and img.get("spreading"):
        flags.append({"lvl": 1, "t": "Larger or redder than your last photo", "do": "Send both photos to the flight surgeon."})
    if "fever" in sel and not flags:
        flags.append({"lvl": 1, "t": "Rash with fever", "do": "Contact the flight surgeon; take your temperature twice daily."})

    scores = []
    for k, d in DX.items():
        s = sum(w for f, w in d["w"].items() if f in sel)
        if img:
            if img.get("redness") == "marked" and k in ("cel", "urt", "acd", "rad"):
                s += 1
            if img.get("redness") == "mild" and k in ("xer", "seb", "mil"):
                s += 1
        scores.append((s, k))
    scores.sort(reverse=True)
    top = [(s, k) for s, k in scores if s >= 4][:3]
    tot = sum(s for s, _ in top) or 1
    ranked = [{"id": k, "score": s, "share": round(100 * s / tot), **{x: DX[k][x] for x in ("n", "what", "cause", "care", "sup", "ref", "esc")}} for s, k in top]
    confidence = "low" if not ranked or ranked[0]["score"] < 7 else "moderate" if ranked[0]["score"] < 11 or (len(ranked) > 1 and ranked[1]["score"] >= ranked[0]["score"] - 2) else "higher"
    labels = {o[0]: o[1] for q in QUESTIONS for o in q["opts"]}
    return {"flags": flags, "ranked": ranked, "confidence": confidence, "understood": sorted(labels.get(f, f) for f in from_text - answered),
            "note": "Decision support only: the likely types are ranked from the pattern you described and the photo measurements. "
                    "The flight surgeon confirms the diagnosis; send the photo with this report."}
