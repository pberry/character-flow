"""SQLite persistence for flowcharts. Each chart is a name plus a JSON blob.

Charts are reached only through unguessable keys: an edit key, stored as a
SHA-256 hash so a leaked database can't be used to change charts, and a view
key, stored as-is so the editor can show the read-only link. The integer id is
internal and never leaves the server.
"""

import hashlib
import json
import secrets
import sqlite3
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS charts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    edit_key_hash TEXT NOT NULL UNIQUE,
    view_key TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_key():
    """128 random bits, URL-safe (22 characters)."""
    return secrets.token_urlsafe(16)


def hash_key(key):
    return hashlib.sha256(key.encode()).hexdigest()


def connect(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init(path, wal=False):
    conn = connect(path)
    try:
        if wal:
            conn.execute("PRAGMA journal_mode=WAL")
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(charts)")}
        if cols and "edit_key_hash" not in cols:
            _migrate_v1(conn)
        conn.executescript(SCHEMA)
    finally:
        conn.close()


def _migrate_v1(conn):
    """Charts from before keys existed: unique names, no keys. Rebuild the table
    (SQLite can't drop a constraint) and give every chart new keys. Old edit
    keys never existed, so links are issued with `python -m app.admin reset-link`."""
    conn.isolation_level = None
    conn.execute("BEGIN")
    try:
        conn.execute("ALTER TABLE charts RENAME TO charts_v1")
        conn.execute(SCHEMA)
        for row in conn.execute("SELECT * FROM charts_v1 ORDER BY id").fetchall():
            conn.execute(
                "INSERT INTO charts (id, name, edit_key_hash, view_key, data, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (row["id"], row["name"], hash_key(new_key()), new_key(), row["data"], row["created_at"], row["updated_at"]),
            )
        conn.execute("DROP TABLE charts_v1")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.isolation_level = ""


def _row_to_chart(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "view_key": row["view_key"],
        "data": json.loads(row["data"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _get(conn, where, value):
    row = conn.execute(f"SELECT * FROM charts WHERE {where} = ?", (value,)).fetchone()
    return _row_to_chart(row) if row else None


def get_by_edit_key(conn, key):
    return _get(conn, "edit_key_hash", hash_key(key))


def get_by_view_key(conn, key):
    return _get(conn, "view_key", key)


def count_charts(conn):
    return conn.execute("SELECT count(*) FROM charts").fetchone()[0]


def list_charts(conn):
    """Every chart, for the operator's admin CLI only."""
    rows = conn.execute(
        "SELECT id, name, created_at, updated_at FROM charts ORDER BY updated_at DESC, id DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def create_chart(conn, name, data):
    """Returns the new chart with its edit key, the only time the key is known."""
    now = _now()
    edit_key = new_key()
    cur = conn.execute(
        "INSERT INTO charts (name, edit_key_hash, view_key, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (name, hash_key(edit_key), new_key(), json.dumps(data), now, now),
    )
    conn.commit()
    chart = _get(conn, "id", cur.lastrowid)
    chart["edit_key"] = edit_key
    return chart


def update_chart(conn, edit_key, name=None, data=None):
    chart = get_by_edit_key(conn, edit_key)
    if chart is None:
        return None
    new_name = chart["name"] if name is None else name
    new_data = chart["data"] if data is None else data
    conn.execute(
        "UPDATE charts SET name = ?, data = ?, updated_at = ? WHERE id = ?",
        (new_name, json.dumps(new_data), _now(), chart["id"]),
    )
    conn.commit()
    return _get(conn, "id", chart["id"])


def delete_chart(conn, edit_key):
    cur = conn.execute("DELETE FROM charts WHERE edit_key_hash = ?", (hash_key(edit_key),))
    conn.commit()
    return cur.rowcount > 0


def reset_edit_key(conn, chart_id):
    """Replace a chart's edit key, invalidating the old link. Returns the new
    key, or None if there's no such chart."""
    key = new_key()
    cur = conn.execute("UPDATE charts SET edit_key_hash = ? WHERE id = ?", (hash_key(key), chart_id))
    conn.commit()
    return key if cur.rowcount else None
