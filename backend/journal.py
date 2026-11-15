"""Private, password-protected journal.

Each astronaut sets their own password. A key is derived from it with scrypt (salted) and every entry is encrypted
with AES-256-GCM before it is written to the database. The password and the key are never stored: without the
password nobody — crewmates, ground, or whoever has the database file — can read the entries.
Unlocking returns a short-lived session token kept only in server memory (auto-locks after 15 minutes idle).
Journal text is never used for health scoring or sent anywhere.
"""
import os
import secrets
import time
from datetime import datetime, timezone

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

CHECK = b"vitals-of-the-void-journal"
IDLE = 15 * 60
PROMPTS = [
    "What went well today, even something small?", "What is weighing on you right now, and what would help?",
    "Describe something you saw or felt today that you want to remember.", "Who would you like to talk to, and what would you tell them?",
    "What are you looking forward to this week?", "Write freely for 15 minutes about your thoughts and feelings about the mission.",
]


def _kdf(password: str, salt: bytes) -> bytes:
    return Scrypt(salt=salt, length=32, n=2 ** 15, r=8, p=1).derive(password.encode("utf-8"))


class Journal:
    def __init__(self, db):
        self.db = db
        self.sessions = {}  # token -> (crew_id, key, last_used)

    def has_password(self, cid):
        return bool(self.db.q("SELECT 1 FROM journal_keys WHERE crew_id=?", (cid,)))

    def set_password(self, cid, password):
        if len(password) < 6:
            raise ValueError("Use at least 6 characters")
        if self.has_password(cid):
            raise ValueError("A password is already set; use change password")
        salt = os.urandom(16)
        key = _kdf(password, salt)
        nonce = os.urandom(12)
        ct = AESGCM(key).encrypt(nonce, CHECK, None)
        self.db.x("INSERT INTO journal_keys VALUES (?,?,?,?)", (cid, salt, nonce, ct))
        return self._open(cid, key)

    def _key_if_valid(self, cid, password):
        r = self.db.q("SELECT salt, check_nonce, check_ct FROM journal_keys WHERE crew_id=?", (cid,))
        if not r:
            return None
        salt, nonce, ct = r[0]
        key = _kdf(password, salt)
        try:
            return key if AESGCM(key).decrypt(nonce, ct, None) == CHECK else None
        except InvalidTag:
            return None

    def unlock(self, cid, password):
        key = self._key_if_valid(cid, password)
        if not key:
            time.sleep(0.6)  # slow down guessing
            raise ValueError("Wrong password")
        return self._open(cid, key)

    def _open(self, cid, key):
        tok = secrets.token_urlsafe(24)
        self.sessions[tok] = [cid, key, time.time()]
        return tok

    def _sess(self, cid, tok):
        s = self.sessions.get(tok or "")
        if not s or s[0] != cid or time.time() - s[2] > IDLE:
            self.sessions.pop(tok or "", None)
            raise PermissionError("Journal is locked")
        s[2] = time.time()
        return s[1]

    def lock(self, tok):
        self.sessions.pop(tok or "", None)

    def entries(self, cid, tok):
        key = self._sess(cid, tok)
        out = []
        for rid, ts, nonce, ct in self.db.q("SELECT id, ts, nonce, ct FROM journal WHERE crew_id=? ORDER BY id DESC", (cid,)):
            try:
                out.append({"id": rid, "ts": ts.split("|")[0], "text": AESGCM(key).decrypt(nonce, ct, None).decode()})
            except InvalidTag:
                out.append({"id": rid, "ts": ts.split("|")[0], "text": "[could not decrypt]"})
        return out

    def add(self, cid, tok, text, day=None):
        key = self._sess(cid, tok)
        text = (text or "").strip()
        if not text:
            raise ValueError("Empty entry")
        nonce = os.urandom(12)
        ct = AESGCM(key).encrypt(nonce, text.encode("utf-8"), None)
        ts = datetime.now(timezone.utc).isoformat()
        self.db.x("INSERT INTO journal (crew_id, ts, nonce, ct) VALUES (?,?,?,?)", (cid, ts + (f"|{day:.3f}" if day is not None else ""), nonce, ct))

    def delete(self, cid, tok, rid):
        self._sess(cid, tok)
        self.db.x("DELETE FROM journal WHERE id=? AND crew_id=?", (rid, cid))

    def change_password(self, cid, old, new):
        key = self._key_if_valid(cid, old)
        if not key:
            raise ValueError("Wrong password")
        if len(new) < 6:
            raise ValueError("Use at least 6 characters")
        rows = self.db.q("SELECT id, nonce, ct FROM journal WHERE crew_id=?", (cid,))
        plain = [(rid, AESGCM(key).decrypt(n, c, None)) for rid, n, c in rows]
        salt = os.urandom(16)
        nk = _kdf(new, salt)
        n0 = os.urandom(12)
        self.db.x("UPDATE journal_keys SET salt=?, check_nonce=?, check_ct=? WHERE crew_id=?", (salt, n0, AESGCM(nk).encrypt(n0, CHECK, None), cid))
        for rid, p in plain:
            n = os.urandom(12)
            self.db.x("UPDATE journal SET nonce=?, ct=? WHERE id=?", (n, AESGCM(nk).encrypt(n, p, None), rid))
        for t in [t for t, s in self.sessions.items() if s[0] == cid]:
            self.sessions.pop(t)

    def entry_days(self, cid):
        """Mission days that have an entry (only the dates, never the text) — used for the routine streak."""
        out = []
        for (ts,) in self.db.q("SELECT ts FROM journal WHERE crew_id=?", (cid,)):
            if "|" in ts:
                try:
                    out.append(float(ts.split("|")[1]))
                except ValueError:
                    pass
        return out
