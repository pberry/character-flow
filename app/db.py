"""SQLite persistence for flowcharts. Each chart is a name plus a JSON blob."""

import json
import sqlite3
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS charts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


class DuplicateName(Exception):
    pass


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init(path):
    with connect(path) as conn:
        conn.executescript(SCHEMA)


def _row_to_chart(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "data": json.loads(row["data"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_charts(conn):
    rows = conn.execute(
        "SELECT id, name, created_at, updated_at FROM charts ORDER BY updated_at DESC, id DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_chart(conn, chart_id):
    row = conn.execute("SELECT * FROM charts WHERE id = ?", (chart_id,)).fetchone()
    return _row_to_chart(row) if row else None


def create_chart(conn, name, data):
    now = _now()
    try:
        cur = conn.execute(
            "INSERT INTO charts (name, data, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (name, json.dumps(data), now, now),
        )
    except sqlite3.IntegrityError as e:
        raise DuplicateName(name) from e
    conn.commit()
    return get_chart(conn, cur.lastrowid)


def update_chart(conn, chart_id, name=None, data=None):
    chart = get_chart(conn, chart_id)
    if chart is None:
        return None
    new_name = chart["name"] if name is None else name
    new_data = chart["data"] if data is None else data
    try:
        conn.execute(
            "UPDATE charts SET name = ?, data = ?, updated_at = ? WHERE id = ?",
            (new_name, json.dumps(new_data), _now(), chart_id),
        )
    except sqlite3.IntegrityError as e:
        raise DuplicateName(new_name) from e
    conn.commit()
    return get_chart(conn, chart_id)


def delete_chart(conn, chart_id):
    cur = conn.execute("DELETE FROM charts WHERE id = ?", (chart_id,))
    conn.commit()
    return cur.rowcount > 0
