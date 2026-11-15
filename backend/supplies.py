"""Mission supplies: inventory, usage log, run-out forecast vs. resupply lead time, datasheet import.

Run-out rule: an item is
  OK        if it lasts longer than resupply lead time + safety margin,
  Order now if it runs out within lead time + margin (order today so resupply arrives in time),
  Critical  if it runs out before a resupply could arrive (or is out / expired).
When no resupply is possible (lunar surface, Mars), the item must last until the end of the mission.
"""
import csv
import io
import json
import math
import re
import uuid
from datetime import datetime, timedelta, timezone

from .countermeasures import SUPPLY_TAGS

CATS = ["Medical kit", "Emergency kit", "Medication", "Support equipment", "Food", "Water & hygiene", "Other"]
FOOD_TYPES = ["Rehydratable", "Thermostabilized", "Irradiated", "Intermediate moisture", "Natural form", "Beverage", "Fresh", "Extended shelf-life bread"]
# Default resupply lead time (days from order to arrival) per mission; None = no resupply during the mission
LEAD_DEFAULT = {"iss": 60, "iss1y": 60, "artemis": None, "mars": None}
MARGIN_DEFAULT = 14


def now_utc():
    return datetime.now(timezone.utc)


class Supplies:
    def __init__(self, store):
        self.s = store
        self.db = store.db

    # ---------- data access
    def items(self):
        return [json.loads(d) for (d,) in self.db.q("SELECT data FROM supplies")]

    def get(self, iid):
        r = self.db.q("SELECT data FROM supplies WHERE id=?", (iid,))
        return json.loads(r[0][0]) if r else None

    # ---------- storage structure: Shelf -> Category -> Item (all named by the crew)
    def struct(self):
        return self.s.db.get("supply_struct", {"shelves": []})

    def save_struct(self, st):
        self.s.db.put("supply_struct", st)

    def place(self, shelf_name, cat_name):
        """Return (shelf_id, cat_id), creating the shelf/category by name if needed."""
        st = self.struct()
        shelf_name = (shelf_name or "Unassigned shelf").strip()
        cat_name = (cat_name or "General").strip()
        sh = next((x for x in st["shelves"] if x["name"].lower() == shelf_name.lower()), None)
        if not sh:
            sh = {"id": uuid.uuid4().hex[:6], "name": shelf_name, "cats": []}
            st["shelves"].append(sh)
        ca = next((x for x in sh["cats"] if x["name"].lower() == cat_name.lower()), None)
        if not ca:
            ca = {"id": uuid.uuid4().hex[:6], "name": cat_name}
            sh["cats"].append(ca)
        self.save_struct(st)
        return sh["id"], ca["id"]

    def struct_op(self, op, b):
        st = self.struct()
        find = lambda sid: next((x for x in st["shelves"] if x["id"] == sid), None)
        if op == "add_shelf":
            st["shelves"].append({"id": uuid.uuid4().hex[:6], "name": b.get("name") or "New shelf", "cats": []})
        elif op == "rename_shelf" and find(b["shelf"]):
            find(b["shelf"])["name"] = b.get("name") or "Shelf"
        elif op == "add_cat" and find(b["shelf"]):
            find(b["shelf"])["cats"].append({"id": uuid.uuid4().hex[:6], "name": b.get("name") or "New category"})
        elif op == "rename_cat" and find(b["shelf"]):
            for c in find(b["shelf"])["cats"]:
                if c["id"] == b["cat"]:
                    c["name"] = b.get("name") or "Category"
        elif op in ("delete_shelf", "delete_cat"):
            sh = find(b["shelf"])
            if not sh:
                return st
            moved = [i for i in self.items() if i.get("shelf") == sh["id"] and (op == "delete_shelf" or i.get("cat") == b.get("cat"))]
            if op == "delete_shelf":
                st["shelves"] = [x for x in st["shelves"] if x["id"] != sh["id"]]
            else:
                sh["cats"] = [c for c in sh["cats"] if c["id"] != b.get("cat")]
            self.save_struct(st)
            for i in moved:  # nothing is lost: items move to "Unassigned shelf"
                i["shelf"], i["cat"] = self.place("Unassigned shelf", "General")
                self.save(i)
            return self.struct()
        self.save_struct(st)
        return st

    def order(self, iid, qty=None, eta_days=None):
        it = self.get(iid)
        if not it:
            return None
        lead = self.lead_time() or 0
        rate, _ = self.burn_rate(it)
        q = float(qty) if qty not in (None, "") else max(1.0, round(rate * (lead + 90)))
        eta = self.now() + timedelta(days=float(eta_days) if eta_days not in (None, "") else lead)
        it["order"] = {"qty": q, "date": self.now().date().isoformat(), "eta": eta.date().isoformat()}
        return self.save(it)

    def received(self, iid):
        it = self.get(iid)
        if not it or not it.get("order"):
            return it
        q = it["order"]["qty"]
        it.pop("order")
        self.save(it)
        return self.log(iid, q, "Resupply received")

    def cancel_order(self, iid):
        it = self.get(iid)
        if it and it.pop("order", None) is not None:
            self.save(it)
        return it

    def save(self, it):
        it.setdefault("id", uuid.uuid4().hex[:8])
        if not it.get("shelf") or not it.get("cat"):
            it["shelf"], it["cat"] = self.place(it.pop("shelf_name", None) or it.get("location") or None,
                                                it.pop("cat_name", None) or it.get("sub") or it.get("kind") or it.get("category"))
        it.pop("shelf_name", None)
        it.pop("cat_name", None)
        it.setdefault("kind", it.get("category") if it.get("category") in CATS else _cat(it.get("category", ""), it.get("name", "")))
        it["qty"] = float(it.get("qty") or 0)
        it["rate"] = float(it.get("rate") or 0)
        if isinstance(it.get("tags"), str):
            it["tags"] = [t.strip() for t in it["tags"].split(",") if t.strip()]
        it.setdefault("tags", [])
        self.db.x("INSERT OR REPLACE INTO supplies VALUES (?,?)", (it["id"], json.dumps(it)))
        return it

    def delete(self, iid):
        self.db.x("DELETE FROM supplies WHERE id=?", (iid,))
        self.db.x("DELETE FROM supply_log WHERE item_id=?", (iid,))

    def log(self, iid, delta, reason="", crew_id=None):
        it = self.get(iid)
        if not it:
            return None
        it["qty"] = max(0.0, float(it["qty"]) + float(delta))
        self.save(it)
        self.db.x("INSERT INTO supply_log (item_id, ts, day, delta, reason, crew_id) VALUES (?,?,?,?,?,?)",
                  (iid, self.now().isoformat(), self.mission_day(), float(delta), reason, crew_id))
        return it

    def history(self, iid, limit=50):
        return [{"ts": ts, "day": d, "delta": de, "reason": re_, "crew": c} for ts, d, de, re_, c in
                self.db.q("SELECT ts, day, delta, reason, crew_id FROM supply_log WHERE item_id=? ORDER BY id DESC LIMIT ?", (iid, limit))]

    # ---------- mission context (uses the first astronaut's mission & launch)
    def mission(self):
        sel = self.s.crew.get(self.s.settings.get("sel") or "")
        if sel:
            return sel
        crew = list(self.s.crew.values())
        return crew[0] if crew else None

    def mission_day(self):
        c = self.mission()
        return c.now_day() if c else 0.0

    def now(self):
        c = self.mission()
        if c and self.s.settings.get("clock") is not None:
            return c.date_of(c.now_day())
        return now_utc()

    def remaining_days(self):
        c = self.mission()
        if not c:
            return None
        end = c.phases()[-1]["end"]
        for p in c.phases():
            if p["e"] == "earth":
                end = p["s"]
                break
        return max(0.0, end - c.now_day())

    def lead_time(self):
        lt = self.s.settings.get("lead")
        if lt not in (None, ""):
            return float(lt)
        c = self.mission()
        return LEAD_DEFAULT.get(c.d.get("mission") if c else "iss", 60)

    # ---------- forecast
    def burn_rate(self, it):
        rows = self.db.q("SELECT day, delta FROM supply_log WHERE item_id=? AND delta<0 ORDER BY day", (it["id"],))
        now = self.mission_day()
        rows = [(d, de) for d, de in rows if d is not None and now - d <= 30]
        if len(rows) >= 2:
            span = max(7.0, now - rows[0][0])
            return -sum(de for _, de in rows) / span, "measured (last 30 d)"
        return float(it.get("rate") or 0), "planned"

    def forecast(self, it):
        rate, basis = self.burn_rate(it)
        qty = float(it.get("qty") or 0)
        days_left = qty / rate if rate > 0 else math.inf
        lead = self.lead_time()
        margin = float(self.s.settings.get("margin") or MARGIN_DEFAULT)
        rem = self.remaining_days()
        st, msg = 0, "Enough stock"
        if qty <= 0:
            st, msg = 2, "Out of stock"
        elif lead is None:
            if rem is not None and days_left < rem:
                st, msg = 2, f"Runs out in {days_left:.0f} d, before mission end ({rem:.0f} d) and no resupply is possible"
            elif rem is not None and days_left < rem + margin:
                st, msg = 1, f"Only {days_left - rem:.0f} d of reserve beyond mission end"
        else:
            if days_left < lead:
                st, msg = 2, f"Runs out in {days_left:.0f} d — before a resupply could arrive ({lead:.0f} d lead time)"
            elif days_left < lead + margin:
                st, msg = 1, f"Order now: lasts {days_left:.0f} d, resupply takes {lead:.0f} d (+{margin:.0f} d margin)"
        exp = it.get("expiry")
        if exp:
            try:
                ed = datetime.fromisoformat(exp).replace(tzinfo=timezone.utc)
                dleft = (ed - self.now()).days
                if dleft < 0:
                    st, msg = 2, "Expired — replace"
                elif (lead is not None and dleft < lead + margin) or (lead is None and rem is not None and dleft < rem):
                    st = max(st, 1)
                    msg = (msg + "; " if st and msg != "Enough stock" else "") + f"expires in {dleft} d"
            except ValueError:
                pass
        order_by = None
        if lead is not None and math.isfinite(days_left):
            order_by = (self.now() + timedelta(days=max(0, days_left - lead - margin))).date().isoformat()
        state = {0: "ok", 1: "order", 2: "critical"}[st]
        od = it.get("order")
        if od:
            try:
                to_eta = (datetime.fromisoformat(od["eta"]).replace(tzinfo=timezone.utc) - self.now()).days
            except (ValueError, KeyError):
                to_eta = lead or 0
            if days_left >= to_eta:
                state, st = "ordered", min(st, 1)
                msg = f"Ordered {od['qty']:.0f} {it.get('unit', '')} on {od['date']}; arrives by {od['eta']}, before stock runs out"
            else:
                state, st = "critical", 2
                msg = f"Ordered, but stock runs out about {to_eta - days_left:.0f} d before it arrives ({od['eta']}): ration or ask for an earlier flight"
        return {"rate": rate, "basis": basis, "days_left": None if not math.isfinite(days_left) else round(days_left, 1),
                "st": st, "state": state, "msg": msg, "lead": lead, "margin": margin, "order_by": order_by}

    def summary(self):
        out = []
        for it in self.items():
            f = self.forecast(it)
            out.append({**it, "fc": f})
        out.sort(key=lambda x: (-x["fc"]["st"], x.get("name", "")))
        return out

    def for_tags(self, tags):
        """Availability of each supply tag used by a countermeasure."""
        items = self.items()
        res, used = [], set()
        for t in tags:
            match = [i for i in items if t in (i.get("tags") or [])]
            if not match:
                res.append({"tag": t, "name": SUPPLY_TAGS.get(t, t), "known": False, "st": None, "qty": None, "msg": "Not in inventory"})
                continue
            best = max(match, key=lambda i: float(i.get("qty") or 0))
            if best["id"] in used:
                continue
            used.add(best["id"])
            f = self.forecast(best)
            res.append({"tag": t, "name": best["name"], "known": True, "item": best["id"], "qty": best["qty"], "unit": best.get("unit", ""),
                        "st": f["st"], "msg": f["msg"], "days_left": f["days_left"]})
        return res

    # ---------- import from datasheets
    HEAD = {"name": ["name", "item", "description", "product"], "category": ["category", "kit", "group", "pack"],
            "sub": ["type", "subcategory", "food type", "class"], "qty": ["qty", "quantity", "count", "amount", "stock", "qty in pack"],
            "unit": ["unit", "units", "uom"], "rate": ["rate", "use per day", "per day", "daily use", "consumption"],
            "expiry": ["expiry", "expiration", "exp", "best before", "shelf life"], "shelf": ["shelf", "location", "stowage", "rack", "locker"],
            "tags": ["tags", "tag", "countermeasure"]}

    def _map_header(self, cells):
        m = {}
        for i, c in enumerate(cells):
            k = str(c or "").strip().lower()
            for f, alts in self.HEAD.items():
                if f not in m and any(k == a or k.startswith(a) for a in alts):
                    m[f] = i
        return m

    def _rows_to_items(self, rows):
        rows = [r for r in rows if any(str(c or "").strip() for c in r)]
        if not rows:
            return []
        hi, m = 0, {}
        for i, r in enumerate(rows[:10]):
            m = self._map_header(r)
            if "name" in m:
                hi = i
                break
        if "name" not in m:  # no header: assume name, qty, unit
            m, hi = {"name": 0, "qty": 1, "unit": 2}, -1
        out = []
        for r in rows[hi + 1:]:
            g = lambda f: (str(r[m[f]]).strip() if f in m and m[f] < len(r) and r[m[f]] is not None else "")
            name = g("name")
            if not name:
                continue
            qty = _num(g("qty"))
            it = {"name": name, "kind": _cat(g("category"), name), "sub": g("sub"), "qty": qty if qty is not None else 0,
                  "unit": g("unit") or "units", "rate": _num(g("rate")) or 0, "expiry": _date(g("expiry")), "shelf_name": g("shelf") or None, "cat_name": g("category") or None,
                  "tags": [t.strip() for t in g("tags").split(",") if t.strip()] or guess_tags(name)}
            if it["kind"] == "Food" and not it["sub"]:
                it["sub"] = _food_type(name)
            out.append(it)
        return out

    def parse_upload(self, filename, data: bytes):
        fn = filename.lower()
        note = ""
        if fn.endswith((".csv", ".tsv", ".txt")):
            text = data.decode("utf-8", "replace")
            dialect = "excel-tab" if "\t" in text.splitlines()[0] else "excel"
            rows = list(csv.reader(io.StringIO(text), dialect=dialect))
            items = self._rows_to_items(rows)
        elif fn.endswith((".xlsx", ".xlsm")):
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
            items = []
            for ws in wb:
                items += self._rows_to_items([list(r) for r in ws.iter_rows(values_only=True)])
        elif fn.endswith(".docx"):
            import docx
            d = docx.Document(io.BytesIO(data))
            items = []
            for t in d.tables:
                items += self._rows_to_items([[c.text for c in row.cells] for row in t.rows])
            if not items:
                items = self._lines_to_items([p.text for p in d.paragraphs])
        elif fn.endswith(".pdf"):
            import pdfplumber
            items, lines = [], []
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                for page in pdf.pages:
                    for t in page.extract_tables() or []:
                        items += self._rows_to_items(t)
                    lines += (page.extract_text() or "").splitlines()
            if not items:
                items = self._lines_to_items(lines)
        elif fn.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff")):
            try:
                import pytesseract
                from PIL import Image
                text = pytesseract.image_to_string(Image.open(io.BytesIO(data)))
                items = self._lines_to_items(text.splitlines())
                note = "Read from the photo with OCR: check every row before saving."
            except Exception:
                items, note = [], "Photo reading needs the Tesseract OCR program installed (see README)."
        else:
            items, note = [], "Unsupported file type. Use CSV, XLSX, DOCX, PDF or a photo."
        return {"items": items, "note": note}

    def parse_text(self, text):
        """Speech/typed text such as 'add 20 tablets of ibuprofen 400 mg to medical locker A, pain and fever; 12 rehydratable meals'."""
        st = self.struct()
        shelves = sorted([s["name"] for s in st["shelves"]], key=len, reverse=True)
        cats = sorted({c["name"] for s in st["shelves"] for c in s["cats"]}, key=len, reverse=True)
        out = []
        for chunk in re.split(r"[;\n]|\bthen\b|\band also\b|,\s*(?=\d)|\band\s+(?=\d)", text, flags=re.I):
            ch = chunk.strip(" .,").strip()
            if not ch:
                continue
            ch = re.sub(r"^(please\s+)?(add|log|we have|there are|stock)\s+", "", ch, flags=re.I)
            shelf = cat = None
            low = ch.lower()
            for s in shelves:
                if s.lower() in low:
                    shelf = s
                    break
            for c in cats:
                if re.search(r"\b" + re.escape(c.lower()) + r"\b", low.split(shelf.lower())[-1] if shelf else low):
                    cat = c
                    break
            ch2 = re.split(r"\b(?:to|in|into|on|onto)\s+(?:the\s+)?(?=" + "|".join(re.escape(x.lower()) for x in shelves) + r")", ch, flags=re.I)[0] if shelves else ch
            m = re.match(r"^(?P<qty>\d+(?:\.\d+)?)\s*(?P<unit>[a-zA-Z]+)?\s+(?:of\s+)?(?P<name>.+)$", ch2.strip())
            if not m:
                m2 = re.match(r"^(?P<name>.+?)\s+(?:x|×|qty|quantity)?\s*(?P<qty>\d+(?:\.\d+)?)\s*(?P<unit>[a-zA-Z]+)?$", ch2.strip())
                if not m2:
                    continue
                m = m2
            unit = (m.group("unit") or "units").lower()
            name = m.group("name").strip(" ,.")
            if unit in ("mg", "g", "ml", "iu") and not m.group(0).lower().startswith(m.group("qty") + " " + unit + " of"):
                name, unit = f"{m.group('qty')} {unit} {name}", "units"
            name = name[0].upper() + name[1:] if name else name
            out.append({"name": name, "kind": _cat("", name), "sub": _food_type(name), "qty": float(m.group("qty")), "unit": unit, "rate": 0,
                        "expiry": None, "shelf_name": shelf, "cat_name": cat, "tags": guess_tags(name)})
        return out

    def parse_spoken(self, text):
        """'ibuprofen 60 tablets, 20 sachets of oral rehydration salts and 400 litres of water' -> item rows."""
        out = []
        for chunk in re.split(r",|;|\n|\band\b|\balso\b", (text or "").lower()):
            ch = chunk.strip(" .")
            if not ch:
                continue
            m = re.match(r"^(?P<qty>\d+(?:\.\d+)?)\s*(?P<unit>[a-z%]+)?\s+(?:of\s+)?(?P<name>.+)$", ch)
            m2 = re.match(r"^(?P<name>.+?)\s+(?P<qty>\d+(?:\.\d+)?)\s*(?P<unit>[a-z%]+)?$", ch)
            mm = m or m2
            if not mm:
                continue
            name = mm.group("name").strip().capitalize()
            unit = mm.group("unit") or "units"
            out.append({"name": name, "kind": _cat("", name + " " + unit), "sub": "", "qty": float(mm.group("qty")), "unit": unit, "rate": 0,
                        "expiry": None, "shelf_name": None, "cat_name": None, "tags": guess_tags(name)})
        return out

    def _lines_to_items(self, lines):
        out = []
        pat = re.compile(r"^\s*(?P<name>[A-Za-z][\w\s\-/().,%+&']{2,}?)\s+[x×:]?\s*(?P<qty>\d+(?:\.\d+)?)\s*(?P<unit>[A-Za-z%]{0,12})\s*$")
        for ln in lines:
            m = pat.match(ln.strip())
            if m:
                name = m.group("name").strip(" -:")
                out.append({"name": name, "kind": _cat("", name), "sub": "", "qty": float(m.group("qty")),
                            "unit": m.group("unit") or "units", "rate": 0, "expiry": None, "shelf_name": None, "cat_name": None, "tags": guess_tags(name)})
        return out


def _num(s):
    try:
        return float(re.sub(r"[^\d.\-]", "", str(s))) if str(s).strip() else None
    except ValueError:
        return None


def _date(s):
    s = str(s or "").strip()
    if not s:
        return None
    for f in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y", "%b %Y", "%m/%Y"):
        try:
            return datetime.strptime(s[:19], f).date().isoformat()
        except ValueError:
            continue
    return None


FOOD_WORDS = {"Rehydratable": ["rehydrat", "freeze", "dried"], "Thermostabilized": ["thermo", "retort", "pouch"], "Irradiated": ["irradiat"],
              "Intermediate moisture": ["jerky", "dried fruit", "intermediate"], "Natural form": ["nut", "granola", "cookie", "cracker", "bar"],
              "Beverage": ["coffee", "tea", "juice", "drink", "beverage"], "Extended shelf-life bread": ["tortilla", "bread", "scone"]}


def _food_type(name):
    n = name.lower()
    for t, ws in FOOD_WORDS.items():
        if any(w in n for w in ws):
            return t
    return ""


def _cat(c, name):
    c2 = (c or "").strip()
    for k in CATS:
        if c2.lower().startswith(k.lower().split()[0]):
            return k
    n = (name + " " + c2).lower()
    if any(w in n for w in ["mg", "tablet", "cream", "spray", "capsule", "drops", "ointment", "injector"]):
        return "Medication"
    if any(w in n for w in ["food", "meal", "ration", "rehydrat", "thermo", "snack", "coffee", "tortilla"]):
        return "Food"
    if any(w in n for w in ["kit", "pack"]):
        return "Medical kit"
    if any(w in n for w in ["oxygen", "mask", "defib", "fire"]):
        return "Emergency kit"
    if any(w in n for w in ["water", "litre", "liter", "wipe", "soap", "towel", "toothpaste", "shampoo"]):
        return "Water & hygiene"
    if any(w in n for w in TAG_WORDS_FLAT):
        return "Medication"
    return c2 or "Other"


TAG_WORDS = {"acetaminophen": ["acetaminophen", "paracetamol", "tylenol"], "ibuprofen": ["ibuprofen", "advil"],
             "antihistamine": ["loratadine", "cetirizine", "fexofenadine", "claritin", "zyrtec"], "diphenhydramine": ["diphenhydramine", "benadryl"],
             "hydrocortisone": ["hydrocortisone"], "emollient": ["emollient", "moisturi", "lotion"], "saline_nasal": ["saline nasal", "nasal saline"],
             "decongestant": ["oxymetazoline", "pseudoephedrine", "afrin", "sudafed"], "oxygen": ["oxygen", "o2 "], "glucose": ["glucose", "dextrose"],
             "antiemetic": ["ondansetron", "promethazine", "zofran", "meclizine", "scopolamine"], "melatonin": ["melatonin"],
             "hypnotic": ["zolpidem", "zaleplon", "ambien", "sonata"], "caffeine": ["caffeine", "coffee"], "vitamin_d": ["vitamin d"],
             "k_citrate": ["potassium citrate"], "kcl": ["potassium chloride"], "magnesium": ["magnesium"], "valacyclovir": ["valacyclovir", "acyclovir tab"],
             "acyclovir_cream": ["acyclovir cream"], "antifungal": ["clotrimazole", "terbinafine", "miconazole", "antifungal"],
             "topical_abx": ["mupirocin", "bacitracin", "neosporin"], "oral_abx": ["cephalexin", "doxycycline", "amoxicillin", "ciprofloxacin", "azithromycin"],
             "epinephrine": ["epinephrine", "epipen", "adrenaline"], "ors": ["rehydration salt", "ors"], "salt_tab": ["salt tablet", "sodium chloride tab"],
             "bandage": ["bandage", "gauze", "dressing", "band-aid", "bandaid"], "cold_pack": ["cold pack", "ice pack"], "ecg": ["ecg", "electrode"],
             "finger_tape": ["tape", "liner"], "steroid_oral": ["prednisone", "dexamethasone"], "abhr": ["sanitiz", "wipe"],
             "compression": ["compression"], "thigh_cuffs": ["thigh cuff", "braslet"], "eye_lube": ["eye drop", "artificial tear"],
             "protein": ["protein"], "water": ["water"], "food": ["meal", "ration", "food", "rehydrat", "thermostab", "irradiat"]}


def guess_tags(name):
    n = (name or "").lower()
    return [t for t, ws in TAG_WORDS.items() if any(w in n for w in ws)]


def starter_inventory(crew_n=3):
    """Illustrative ISS-style starting inventory (sample data; quantities are examples)."""
    D = lambda days: (now_utc() + timedelta(days=days)).date().isoformat()
    f = crew_n / 3
    MED, EMR, EQ, GAL, HYG = "Medical locker A", "Emergency rack", "Equipment bay", "Galley pantry", "Hygiene station"
    rows = [
        # name, kind, sub, qty, unit, use/day, expiry, tags, shelf, category
        ("Acetaminophen 325 mg tablets", "Medication", "", 100, "tablets", 0.4, D(700), ["acetaminophen"], MED, "Pain & fever"),
        ("Ibuprofen 400 mg tablets", "Medication", "", 60, "tablets", 0.5, D(700), ["ibuprofen"], MED, "Pain & fever"),
        ("Loratadine 10 mg tablets", "Medication", "", 30, "tablets", 0.3, D(600), ["antihistamine"], MED, "Allergy & skin"),
        ("Diphenhydramine 25 mg capsules", "Medication", "", 20, "capsules", 0.05, D(600), ["diphenhydramine"], MED, "Allergy & skin"),
        ("Hydrocortisone 1 % cream", "Medication", "", 4, "tubes", 0.02, D(500), ["hydrocortisone"], MED, "Allergy & skin"),
        ("Clotrimazole 1 % cream", "Medication", "", 3, "tubes", 0.01, D(500), ["antifungal"], MED, "Allergy & skin"),
        ("Mupirocin 2 % ointment", "Medication", "", 3, "tubes", 0.01, D(500), ["topical_abx"], MED, "Infection"),
        ("Valacyclovir 500 mg tablets", "Medication", "", 30, "tablets", 0, D(600), ["valacyclovir"], MED, "Infection"),
        ("Acyclovir 5 % cream", "Medication", "", 2, "tubes", 0, D(500), ["acyclovir_cream"], MED, "Infection"),
        ("Cephalexin 500 mg capsules", "Medication", "", 28, "capsules", 0, D(600), ["oral_abx"], MED, "Infection"),
        ("Ondansetron 4 mg ODT", "Medication", "", 20, "tablets", 0.02, D(600), ["antiemetic"], MED, "Stomach"),
        ("Zolpidem 5 mg tablets", "Medication", "", 30, "tablets", 0.25, D(600), ["hypnotic"], MED, "Sleep & alertness"),
        ("Melatonin 3 mg tablets", "Medication", "", 60, "tablets", 0.5, D(600), ["melatonin"], MED, "Sleep & alertness"),
        ("Vitamin D3 800 IU tablets", "Medication", "", 400, "tablets", crew_n, D(700), ["vitamin_d"], MED, "Vitamins & minerals"),
        ("Potassium citrate 20 mEq tablets", "Medication", "", 60, "tablets", 0, D(700), ["k_citrate"], MED, "Vitamins & minerals"),
        ("Magnesium 250 mg tablets", "Medication", "", 60, "tablets", 0, D(700), ["magnesium"], MED, "Vitamins & minerals"),
        ("Potassium chloride 20 mEq", "Medication", "", 40, "tablets", 0, D(700), ["kcl"], MED, "Vitamins & minerals"),
        ("Saline nasal spray", "Medication", "", 6, "bottles", 0.05, D(500), ["saline_nasal"], MED, "Nose & eyes"),
        ("Oxymetazoline nasal spray", "Medication", "", 4, "bottles", 0.02, D(500), ["decongestant"], MED, "Nose & eyes"),
        ("Eye lubricant drops", "Medication", "", 6, "bottles", 0.03, D(500), ["eye_lube"], MED, "Nose & eyes"),
        ("Glucose tablets 4 g", "Medication", "", 40, "tablets", 0.05, D(700), ["glucose"], MED, "Fluids & sugar"),
        ("Oral rehydration salts", "Medication", "", 30, "sachets", 0.1, D(700), ["ors"], MED, "Fluids & sugar"),
        ("Salt tablets 1 g", "Medication", "", 60, "tablets", 0, D(700), ["salt_tab"], MED, "Fluids & sugar"),
        ("Bandages & gauze", "Medical kit", "", 80, "pieces", 0.2, None, ["bandage"], MED, "First aid"),
        ("Cold packs (instant)", "Medical kit", "", 10, "packs", 0.05, None, ["cold_pack"], MED, "First aid"),
        ("Epinephrine auto-injector 0.3 mg", "Emergency kit", "", 4, "injectors", 0, D(400), ["epinephrine"], EMR, "Anaphylaxis"),
        ("Prednisone 10 mg tablets", "Medication", "", 30, "tablets", 0, D(600), ["steroid_oral"], EMR, "Anaphylaxis"),
        ("Oxygen mask & supply", "Emergency kit", "", 4, "kits", 0, None, ["oxygen"], EMR, "Breathing"),
        ("ECG electrodes", "Support equipment", "", 120, "electrodes", 1.5, D(500), ["ecg"], EQ, "Diagnostics"),
        ("Ultrasound unit & gel", "Support equipment", "", 1, "unit", 0, None, ["ultrasound"], EQ, "Diagnostics"),
        ("Rebound tonometer probes", "Support equipment", "", 60, "probes", 0.3, D(700), ["tonometer"], EQ, "Diagnostics"),
        ("Personal dosimeters", "Support equipment", "", 4, "units", 0, None, ["dosimeter"], EQ, "Diagnostics"),
        ("Thigh cuffs (Braslet)", "Support equipment", "", 3, "pairs", 0, None, ["thigh_cuffs"], EQ, "Countermeasure devices"),
        ("Compression garments", "Support equipment", "", 3, "sets", 0, None, ["compression"], EQ, "Countermeasure devices"),
        ("Adjustable-focus glasses", "Support equipment", "", 3, "pairs", 0, None, ["superfocus"], EQ, "Countermeasure devices"),
        ("Finger tape / glove liners", "Support equipment", "", 40, "sets", 0.1, None, ["finger_tape", "glove"], EQ, "Spacewalk support"),
        ("Rehydratable meals", "Food", "Rehydratable", 700, "packages", 10.8 * f, D(900), ["food"], GAL, "Rehydratable"),
        ("Thermostabilized entrées", "Food", "Thermostabilized", 900, "pouches", 7.2 * f, D(900), ["food"], GAL, "Thermostabilized"),
        ("Irradiated meats", "Food", "Irradiated", 160, "pouches", 1.8 * f, D(900), ["food"], GAL, "Irradiated"),
        ("Natural-form snacks", "Food", "Natural form", 900, "packages", 9 * f, D(900), ["food"], GAL, "Natural form"),
        ("Protein supplement", "Food", "Natural form", 120, "servings", 1, D(600), ["protein"], GAL, "Natural form"),
        ("Beverage packets (coffee, tea, juice)", "Food", "Beverage", 1200, "packets", 12 * f, D(900), ["caffeine"], GAL, "Beverages"),
        ("Potable water reserve (drink bags)", "Water & hygiene", "", 400, "L", 3, None, ["water"], HYG, "Water"),
        ("Skin emollient", "Water & hygiene", "", 8, "tubes", 0.08, D(700), ["emollient"], HYG, "Skin care"),
        ("Hand sanitiser wipes", "Water & hygiene", "", 600, "wipes", 6, D(700), ["abhr"], HYG, "Skin care"),
    ]
    return [{"name": n, "kind": k, "sub": s, "qty": q, "unit": u, "rate": r, "expiry": e, "tags": t, "shelf_name": sh, "cat_name": ca, "sample": True}
            for n, k, s, q, u, r, e, t, sh, ca in rows]


TAG_WORDS_FLAT = [w for k, ws in TAG_WORDS.items() if k not in ("emollient", "water", "food") for w in ws]
