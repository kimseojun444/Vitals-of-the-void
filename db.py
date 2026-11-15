"""SQLite storage. One file (data/vitals.db) holds settings, crew, health records, supplies, journal and rash reports."""
import json
import sqlite3
import threading
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "vitals.db"
_lock = threading.RLock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS crew (id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY AUTOINCREMENT, crew_id TEXT, var TEXT, day REAL, value REAL, src TEXT);
CREATE INDEX IF NOT EXISTS rec_crew ON records(crew_id);
CREATE TABLE IF NOT EXISTS supplies (id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS supply_log (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT, ts TEXT, day REAL, delta REAL, reason TEXT, crew_id TEXT);
CREATE TABLE IF NOT EXISTS journal_keys (crew_id TEXT PRIMARY KEY, salt BLOB, check_nonce BLOB, check_ct BLOB);
CREATE TABLE IF NOT EXISTS journal (id INTEGER PRIMARY KEY AUTOINCREMENT, crew_id TEXT, ts TEXT, nonce BLOB, ct BLOB);
CREATE TABLE IF NOT EXISTS symptom_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, crew_id TEXT, day REAL, ts TEXT, symptoms TEXT, note TEXT, image BLOB);
CREATE TABLE IF NOT EXISTS rash (id INTEGER PRIMARY KEY AUTOINCREMENT, crew_id TEXT, day REAL, ts TEXT, data TEXT, image BLOB);
"""


class DB:
    def __init__(self, path=DB_PATH):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(str(path), check_same_thread=False)
        self.con.executescript(SCHEMA)
        self.con.commit()

    def q(self, sql, args=()):
        with _lock:
            return self.con.execute(sql, args).fetchall()

    def x(self, sql, args=()):
        with _lock:
            cur = self.con.execute(sql, args)
            self.con.commit()
            return cur.lastrowid

    def xmany(self, sql, rows):
        with _lock:
            self.con.executemany(sql, rows)
            self.con.commit()

    # key/value settings
    def get(self, key, default=None):
        r = self.q("SELECT value FROM kv WHERE key=?", (key,))
        return json.loads(r[0][0]) if r else default

    def put(self, key, value):
        self.x("INSERT OR REPLACE INTO kv VALUES (?,?)", (key, json.dumps(value)))
