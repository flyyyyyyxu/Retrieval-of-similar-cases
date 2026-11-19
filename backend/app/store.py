"""本地 SQLite：检索记录、反馈、数据源缓存。文件在 var/，不进 Git。"""

import json
import sqlite3
import time
import uuid
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS searches (
    id TEXT PRIMARY KEY, created_at REAL, request TEXT, response TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at REAL,
    search_id TEXT, case_id TEXT, relevant INTEGER, reason TEXT
);
CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY, created_at REAL, value TEXT
);
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL
);
"""


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self._conn() as c:
            c.executescript(SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def new_search_id(self) -> str:
        return uuid.uuid4().hex[:12]

    def save_search(self, search_id: str, request: dict, response: dict) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO searches VALUES (?, ?, ?, ?)",
                (search_id, time.time(), _dump(request), _dump(response)),
            )

    def save_feedback(self, search_id: str, case_id: str, relevant: bool, reason: str | None):
        with self._conn() as c:
            c.execute(
                "INSERT INTO feedback (created_at, search_id, case_id, relevant, reason) "
                "VALUES (?, ?, ?, ?, ?)",
                (time.time(), search_id, case_id, int(relevant), reason),
            )

    def get_search(self, search_id: str) -> tuple[dict, dict] | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT request, response FROM searches WHERE id = ?", (search_id,),
            ).fetchone()
        return (json.loads(row[0]), json.loads(row[1])) if row else None

    def cache_put(self, key: str, value) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO cache VALUES (?, ?, ?)", (key, time.time(), _dump(value))
            )

    def cache_get(self, key: str):
        with self._conn() as c:
            row = c.execute("SELECT value FROM cache WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def create_report(self, report: dict):
        with self._conn() as c:
            c.execute("INSERT INTO reports VALUES (?, ?, ?, ?)",
                      (report["id"], report["revision"], report["updated_at"], _dump(report)))

    def get_report(self, report_id: str):
        with self._conn() as c:
            row = c.execute("SELECT data FROM reports WHERE id = ?", (report_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def list_reports(self):
        with self._conn() as c:
            rows = c.execute("SELECT data FROM reports ORDER BY updated_at DESC").fetchall()
        return [json.loads(row[0]) for row in rows]

    def update_report(self, report: dict, expected_revision: int) -> bool:
        with self._conn() as c:
            result = c.execute(
                "UPDATE reports SET revision=?, updated_at=?, data=? WHERE id=? AND revision=?",
                (report["revision"], report["updated_at"], _dump(report), report["id"], expected_revision),
            )
        return result.rowcount == 1


def _dump(v) -> str:
    return json.dumps(v, ensure_ascii=False)
