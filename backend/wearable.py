"""Vitals in the Void — wearable battery telemetry and the Earth Flight Surgeon Uplink.

Battery (per astronaut)
  * Drains while the wearable streams (each stream sample stands for 5 min of wear at ~3.5 %/h)
    and slowly in standby (0.8 %/h, real time).
  * Recharge: standard (+8.75 %/s, simulated, ~0.05 % cell wear per full charge) or Fast-Recharge
    (4x faster, ~1.1 % wear per full charge, more when used 3+ times in 24 h). Health and cycle
    count are tracked; frequent fast charging raises a cell-wear warning.
  * Low-battery warnings at 20 %, then every 5 % below (15, 10, 5) and when it runs out
    (the stream stops by itself at 0 %). Events are queued for every screen to show.

Earth Flight Surgeon Uplink (Preventive Escalation Relay)
  * Scans the last 24–48 h of key measures for a negative drift (slope, 48 h change against the prior
    week, distance from the personal expected value, 14-day trend) and projects when the value would
    reach its critical limit.
  * The top drift becomes an escalation packet for the Earth flight surgeons. Transmitting it waits out
    the real one-way signal delay for the current location (ISS ≈ live, Moon ≈ 1.3 s, Mars ≈ 14 min).
  * An interim countermeasure is suggested from the app's own verified countermeasure library while
    Earth reviews. (The reference's AI assistant is intentionally not included.)
"""
import json
import math
import time

from . import reference as RF

TH = [20, 15, 10, 5]
STD_RATE, FAST_RATE = 8.75, 35.0          # % per second while charging (simulated)
STREAM_DRAIN = 3.5 * 5 / 60               # % per stream sample (5 min of wear at 3.5 %/h)
IDLE_DRAIN_H = 0.8                        # % per real hour in standby


class Wearables:
    def __init__(self, store):
        self.store = store

    # ------------------------------------------------------------------ state
    def _s(self):
        s = self.store.settings
        s.setdefault("battery", {})
        s.setdefault("bat_events", [])
        s.setdefault("uplink", {})
        return s

    def _m(self, cid):
        b = self._s()["battery"]
        m = b.get(cid)
        if not isinstance(m, dict):
            m = b[cid] = {"pct": 88.0, "t": time.time(), "charging": False, "fast": False, "health": 98.4,
                          "cycles": 14, "fast_hist": [], "alerted": None, "counted": False}
        m["fast_hist"] = [x for x in m.get("fast_hist", []) if x >= time.time() - 86400]
        return m

    def _event(self, cid, kind, lvl, msg, pct=None):
        s = self._s()
        nid = (s["bat_events"][-1]["id"] + 1) if s["bat_events"] else 1
        c = self.store.crew.get(cid)
        s["bat_events"].append({"id": nid, "cid": cid, "name": c.d["name"] if c else "", "kind": kind, "lvl": lvl,
                                "msg": msg, "pct": pct, "t": time.time()})
        del s["bat_events"][:-60]

    def _thresholds(self, cid, m, before):
        """Warn at 20 %, then at every 5 % step below it (15, 10, 5); re-arm once charged above 20 %."""
        pct = m["pct"]
        name = self.store.crew[cid].d["name"].split(" ")[0] if cid in self.store.crew else ""
        if pct >= 20:
            m["alerted"] = None
            return
        crossed = [t for t in TH if pct < t and (m["alerted"] is None or t < m["alerted"])]
        if not crossed:
            return
        t = min(crossed)
        m["alerted"] = t
        lvl = 1 if t >= 15 else 2
        self._event(cid, "low", lvl, f"{name}'s wearable battery is below {t}% ({round(pct)}%). "
                    + ("Recharge it soon to avoid a gap in the data." if lvl == 1 else "Recharge now: continuous monitoring stops when it runs out."), round(pct))

    def _advance(self, cid, m):
        """Bring the battery up to date (charging or standby drain since the last update)."""
        now = time.time()
        dt = max(0.0, now - m.get("t", now))
        m["t"] = now
        before = m["pct"]
        if m["charging"]:
            rate = FAST_RATE if m["fast"] else STD_RATE
            gained = min(100 - m["pct"], rate * dt)
            wear = (1.1 * (1.4 if len(m["fast_hist"]) >= 3 else 1.0)) if m["fast"] else 0.05
            m["health"] = max(50.0, round(m["health"] - gained / 100 * wear, 3))
            m["pct"] = min(100.0, m["pct"] + gained)
            if m["pct"] >= 100:
                m["pct"], m["charging"], m["counted"] = 100.0, False, False
                m["cycles"] = m.get("cycles", 14) + 1
                m["alerted"] = None
                self._event(cid, "charged", 0, ("Fast-Recharge complete" if m["fast"] else "Wearable recharged") + f" to 100% (battery health {m['health']:.1f}%).", 100)
        elif cid not in self._s().get("streams", {}):
            m["pct"] = max(0.0, m["pct"] - IDLE_DRAIN_H * dt / 3600)
            self._thresholds(cid, m, before)

    def stream_tick(self, cid):
        """Called for every stream sample. Returns False when the battery is empty (stream must stop)."""
        m = self._m(cid)
        self._advance(cid, m)
        if m["charging"]:
            return True
        before = m["pct"]
        m["pct"] = max(0.0, m["pct"] - STREAM_DRAIN)
        self._thresholds(cid, m, before)
        if m["pct"] <= 0:
            self._event(cid, "dead", 2, f"{self.store.crew[cid].d['name'].split(' ')[0]}'s wearable battery is empty — the live stream has stopped. Recharge the band, then restart the stream.", 0)
            return False
        return True

    def battery(self, cid):
        m = self._m(cid)
        self._advance(cid, m)
        streaming = cid in self._s().get("streams", {})
        pct, fast, ch = m["pct"], m["fast"], m["charging"]
        rate = 3.5 if streaming else IDLE_DRAIN_H
        hours = pct / rate if rate else 99
        nfast = len(m["fast_hist"])
        state = ("fast" if fast else "charging") if ch else ("low" if pct < 20 else "moderate" if pct < 35 else "ok")
        return {"pct": round(pct, 2), "charging": ch, "fast": fast, "health": round(m["health"], 2), "cycles": m["cycles"],
                "fast_24h": nfast, "streaming": streaming, "state": state, "lvl": 2 if pct < 10 and not ch else 1 if pct < 20 and not ch else 0,
                "time_to_full_s": round((100 - pct) / (FAST_RATE if fast else STD_RATE), 1) if ch else None,
                "time_to_empty_h": round(hours, 1), "discharge_rate": rate, "charge_rate": FAST_RATE if fast else STD_RATE,
                "wear_alert": 2 if (nfast >= 5 or m["health"] < 90) else 1 if nfast >= 3 else 0}

    def battery_action(self, cid, action, value=None):
        m = self._m(cid)
        self._advance(cid, m)
        msg = ""
        if action == "fast":
            m["fast"] = bool(value) if value is not None else not m["fast"]
            if m["fast"] and m["charging"] and not m["counted"]:
                m["counted"] = True
                m["fast_hist"].append(time.time())
            msg = "Fast-Recharge on: 4× faster, more battery wear." if m["fast"] else "Standard recharge: gentle on the battery."
        elif action == "charge":
            if m["charging"]:
                m["charging"], m["counted"] = False, False
                msg = f"Recharge paused at {round(m['pct'])}%."
            elif m["pct"] >= 100:
                msg = "The battery is already full."
            else:
                m["charging"] = True
                if m["fast"]:
                    m["counted"] = True
                    m["fast_hist"].append(time.time())
                msg = "Fast-recharging the wearable (4× speed)…" if m["fast"] else "Recharging the wearable to 100%…"
                if m["fast"] and len(m["fast_hist"]) >= 3:
                    self._event(cid, "wear", 1, f"Frequent Fast-Recharge: {len(m['fast_hist'])} rapid charges in 24 h. This wears the battery faster (health {m['health']:.1f}%).")
        elif action == "testlow":
            before = m["pct"]
            m["charging"], m["counted"], m["pct"] = False, False, 12.0
            self._thresholds(cid, m, before)
            msg = "Battery set to 12% for testing."
        self.store.save_settings()
        return msg

    def events_since(self, since):
        return [e for e in self._s()["bat_events"] if e["id"] > since]

    # ------------------------------------------------------------------ Earth uplink
    def _u(self, cid):
        u = self._s()["uplink"]
        m = u.get(cid)
        if not isinstance(m, dict):
            m = u[cid] = {"tx": "standby", "t0": 0, "delay": 0, "sim": False, "ack": False}
        return m

    @staticmethod
    def delay_seconds(c, d):
        e = c.env_at(d)
        if e in ("leo", "earth"):
            return 2.0          # TDRS relay + ground network
        if e == "moon":
            return 1.3
        return 862.0            # deep-space relay window used for Mars (14 min 22 s)

    def uplink(self, c, guidance=None, cms_fn=None):
        cid, d, m = c.id, c.now_day(), self._u(c.id)
        watch = ["hrv", "pvt", "sleep", "stress", "mood", "hr", "spo2", "onsd", "iop", "scort", "sbp", "ctemp", "ctx", "glu", "dose", "rem", "vis"]
        cands = []
        for vid in watch:
            v = RF.VM.get(vid)
            if not v:
                continue
            recs = [r for r in c.of_var(vid) if r[2] <= d]
            if len(recs) < 2:
                continue
            last = recs[-1]
            E, tol, L = c.expected(vid, d), max(1e-3, c.tol(vid, d)), c.lims(vid)
            _, stv = c.status_latest(vid, d)
            stv = stv or {"lvl": 0, "z": 0, "dir": None}
            win = [r for r in recs if r[2] >= d - 2.6]
            ss = win if len(win) >= 2 else recs[-6:]
            slope = 0.0
            if len(ss) >= 2:
                mx = sum(r[2] for r in ss) / len(ss); my = sum(r[3] for r in ss) / len(ss)
                sxx = sum((r[2] - mx) ** 2 for r in ss)
                if sxx > 1e-6:
                    slope = sum((r[2] - mx) * (r[3] - my) for r in ss) / sxx
            prior = [r[3] for r in recs if d - 9 <= r[2] <= d - 2]
            d48 = last[3] - (sum(prior) / len(prior) if prior else E)
            z = (last[3] - E) / tol
            zs = slope * 2 / tol
            tr = c.trend(vid, d) or {}
            lv = stv.get("lvl") or 0
            dr = v.get("dir")
            if dr == "lo":
                neg = slope < -0.18 * tol or d48 < -0.75 * tol or z < -0.85 or tr.get("bad")
                score = max(0, -z) + max(0, -zs * .9) + lv * 1.4
            elif dr == "hi":
                neg = slope > 0.18 * tol or d48 > 0.75 * tol or z > 0.85 or tr.get("bad")
                score = max(0, z) + max(0, zs * .9) + lv * 1.4
            else:
                neg = (abs(z) > 1 and abs(zs) > .35) or tr.get("bad")
                score = abs(z) + abs(zs * .8) + lv * 1.4
            if not neg or score < 1.15:
                continue
            lo = L.get("cl") if L.get("cl") is not None else L.get("wl")
            hi = L.get("ch") if L.get("ch") is not None else L.get("wh")
            crit_lo = lo if lo is not None else E - 2.8 * tol
            crit_hi = hi if hi is not None else E + 2.8 * tol
            crit = crit_lo if dr == "lo" else crit_hi if dr == "hi" else (crit_hi if last[3] >= E else crit_lo)
            rate = abs(slope) if abs(slope) > .05 * tol else max(.25 * tol, abs(d48) / 2)
            dist = (last[3] - crit) if dr == "lo" else (crit - last[3]) if dr == "hi" else abs(crit - last[3])
            h2c = 0 if dist <= 0 else max(3.5, min(168, dist / rate * 24))
            sl = -abs(slope or d48 / 2) if dr == "lo" else abs(slope or d48 / 2) if dr == "hi" else slope
            cands.append({"vid": vid, "name": v["n"], "unit": v.get("u", ""), "dp": v.get("dp", 1), "dir": dr, "val": last[3], "E": E, "tol": tol,
                          "crit": crit, "slope": sl, "d48": d48, "h2c": h2c, "lvl": max(1, lv), "st": stv, "score": score,
                          "pts": [[r[2], r[3]] for r in recs if r[2] >= d - 5][-10:], "sim": False})
        if m["sim"] and (not cands or max(x["score"] for x in cands) < 2.2):
            bE, bt = c.expected("hrv", d) or 45, c.tol("hrv", d) or 7
            crit = c.lims("hrv").get("cl") or max(12, round(bE - 2.9 * bt))
            cv = max(crit + 5.5, round(bE - 1.9 * bt, 1))
            sl = -((bE - cv) / 2)
            eta = max(6, round((cv - crit) / max(1.5, abs(sl)) * 24, 1))
            cands.insert(0, {"vid": "hrv", "name": "Heart rate variability (RMSSD)", "unit": "ms", "dp": 1, "dir": "lo", "val": cv, "E": bE, "tol": bt,
                             "crit": crit, "slope": sl, "d48": cv - bE, "h2c": eta, "lvl": 1, "st": {"lvl": 1, "z": -1.9, "dir": "lo", "why": "48 h drift"},
                             "score": 4.5, "pts": [[d - 2, round(bE - .1 * bt, 1)], [d - 1.5, round(bE - .5 * bt, 1)], [d - 1, round(bE - bt, 1)], [d - .5, round(bE - 1.5 * bt, 1)], [d, cv]], "sim": True})
        cands.sort(key=lambda x: -x["score"])
        p = cands[0] if cands else None
        names = {s[0]: s[1] for s in RF.SYMPTOMS}
        sym = list(dict.fromkeys(names.get(r[1][4:], r[1][4:]) for r in c.symptoms_recent(d, 2)))
        if p and p["sim"] and "Fatigue" not in " ".join(sym):
            sym.insert(0, "Mild fatigue (48 h trend, simulated)")
        flagged = bool(p)
        if not flagged and m["tx"] == "queued":
            m["tx"] = "standby"
        mode, label, remaining = "standby", "Standby", m.get("delay", 0)
        if m["tx"] == "active" and m["t0"]:
            remaining = max(0.0, m["delay"] - (time.time() - m["t0"]))
            if remaining <= 0:
                m["tx"] = "acknowledged"
                mode, label = "acknowledged", "Packet delivered · flight surgeon review"
            else:
                mode, label = "active", f"Transmitting · signal delay {int(remaining // 60)}m {int(remaining % 60):02d}s"
        elif m["tx"] == "acknowledged" and flagged:
            mode, label = "acknowledged", "Packet delivered · flight surgeon review"
        elif flagged:
            mode, label = "queued", "Queued: predictive drift detected"
        eta = ("Critical threshold reached" if p["h2c"] <= 0 else ("~" + (f"{p['h2c']:.1f} hrs" if p["h2c"] < 24 else f"{p['h2c'] / 24:.1f} days ({round(p['h2c'])} hrs)"))) if p else "Nominal (> 7 days)"
        g = None
        if p and guidance:
            st = dict(p["st"]); st.setdefault("dir", p["dir"] if p["dir"] in ("hi", "lo") else ("lo" if p["val"] < p["E"] else "hi"))
            if not st.get("dir"):
                st["dir"] = "lo" if p["val"] < p["E"] else "hi"
            try:
                g = guidance(c, p["vid"], st, max(1, p["lvl"]))
            except Exception:
                g = None
        interim = ""
        if p:
            if p["vid"] in ("hrv", "sleep", "pvt", "stress", "mood", "rem"):
                interim = "Autonomic recovery: protect an uninterrupted 8.5 h sleep window, 5 minutes of slow breathing (6 breaths/min), drink 500 mL of water, and hold off high-load EVA scheduling until the flight surgeon has reviewed."
            elif p["vid"] in ("onsd", "iop", "vis"):
                interim = "Fluid-shift countermeasure: thigh cuffs (Braslet) or a lower-body negative-pressure session, raise the head of the sleeping bag, and repeat the eye ultrasound / pressure before the next communication pass."
            elif p["vid"] in ("spo2", "hr", "sbp"):
                interim = "Cardiorespiratory guard: pause strenuous exercise, check cabin O₂/CO₂, repeat the reading seated at rest, and drink 500 mL of fluid if blood pressure is low."
            else:
                interim = "Preventive watch: stay hydrated, keep the scheduled resistive exercise, and log a confirmation reading in 4 hours while Earth reviews."
        packet = None
        if p:
            fmtv = lambda x: f"{x:.{p['dp']}f}"
            packet = {"packet_id": f"VITV-ESCALATION-{cid[:4].upper()}-D{math.floor(d)}",
                      "relay": f"DEEP-SPACE ({int(remaining // 60)}m {int(remaining % 60):02d}s)" if mode == "active" else "NASA-JSC-FLIGHT-SURGEON",
                      "mission_day": round(d, 2), "crew_member": f"{c.d['name']} ({c.d.get('role') or 'Crew'})",
                      "priority": "PRIORITY-1-EARLY-WARNING" if p["lvl"] >= 2 else "PREVENTIVE-DRIFT-WATCH",
                      "primary_biomarker": f"{p['name']} [{p['vid']}]",
                      "current_vs_baseline": f"{fmtv(p['val'])} {p['unit']} (expected {fmtv(p['E'])} {p['unit']})",
                      "drift_48h_rate": f"{p['slope']:+.2f} {p['unit']}/day", "critical_threshold": f"{fmtv(p['crit'])} {p['unit']}",
                      "projected_breach_eta": eta, "corroborating_symptoms": sym or ["None logged in last 48 h"],
                      "secondary_trends": [f"{x['name']} ({x['val']:.{x['dp']}f} {x['unit']})" for x in cands[1:3]],
                      "interim_countermeasure": interim}
        if p:
            p = {k: v for k, v in p.items() if k != "st"}
        return {"flagged": flagged, "mode": mode, "label": label, "remaining": remaining, "primary": p, "eta": eta,
                "symptoms": sym, "guide": g, "interim": interim, "packet": json.dumps(packet, indent=2, ensure_ascii=False) if packet else "",
                "sim": m["sim"], "ack": m["ack"], "delay": self.delay_seconds(c, d), "secondary": [{"name": x["name"], "val": x["val"], "unit": x["unit"], "dp": x["dp"]} for x in cands[1:3]]}

    def uplink_action(self, c, action):
        m = self._u(c.id)
        msg = ""
        if action == "sim":
            m["sim"] = not m["sim"]
            m["tx"], m["t0"] = ("queued" if m["sim"] else "standby"), 0
            msg = "48 h drift simulated — the Earth uplink is flagged." if m["sim"] else "Drift simulation cleared."
        elif action == "transmit":
            m["tx"], m["t0"], m["delay"] = "active", time.time(), self.delay_seconds(c, c.now_day())
            dl = m["delay"]
            msg = f"Escalation packet sent to Earth (signal delay {int(dl // 60)}m {int(dl % 60):02d}s)." if dl >= 60 else f"Escalation packet sent to Earth (signal delay {dl:.1f} s)."
        elif action == "ack":
            m["ack"] = True
            msg = "Interim countermeasure started."
        self.store.save_settings()
        return msg
