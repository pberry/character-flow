import sqlite3

from app import db

V1_SCHEMA = """
CREATE TABLE charts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def make_v1(path):
    conn = sqlite3.connect(path)
    conn.executescript(V1_SCHEMA)
    conn.executemany(
        "INSERT INTO charts (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [(2, "Pat", '{"a": 1}', "2026-10-17T00:00:00+00:00", "2026-10-17T00:00:00+00:00"),
         (4, "Meren", '{"b": 2}', "2026-10-18T00:00:00+00:00", "2026-10-24T00:00:00+00:00")],
    )
    conn.commit()
    conn.close()


def test_keys_are_long_and_random():
    keys = {db.new_key() for _ in range(100)}
    assert len(keys) == 100
    assert all(len(k) >= 22 for k in keys)


def test_edit_key_is_stored_only_as_hash(tmp_path):
    path = tmp_path / "t.db"
    db.init(path)
    conn = db.connect(path)
    chart = db.create_chart(conn, "A", {"x": 1})
    conn.close()
    raw = path.read_bytes()
    assert chart["edit_key"].encode() not in raw
    assert db.hash_key(chart["edit_key"]).encode() in raw


def test_migrates_v1_keeping_rows(tmp_path):
    path = tmp_path / "old.db"
    make_v1(path)
    db.init(path)
    conn = db.connect(path)
    charts = {c["name"]: c for c in db.list_charts(conn)}
    assert set(charts) == {"Pat", "Meren"}
    assert charts["Meren"]["id"] == 4
    assert charts["Meren"]["updated_at"] == "2026-10-24T00:00:00+00:00"
    # Every row got distinct keys.
    rows = conn.execute("SELECT edit_key_hash, view_key FROM charts").fetchall()
    assert len({r[0] for r in rows}) == 2 and len({r[1] for r in rows}) == 2
    # Names are no longer unique, and new ids continue after the old ones.
    new = db.create_chart(conn, "Pat", {})
    assert new["id"] > 4
    # Data survives; a reset key opens the migrated chart.
    key = db.reset_edit_key(conn, 4)
    assert db.get_by_edit_key(conn, key)["data"] == {"b": 2}
    conn.close()
    # Running init again is a no-op.
    db.init(path)
    assert len(db.list_charts(db.connect(path))) == 3


def test_reset_edit_key_invalidates_old(tmp_path):
    path = tmp_path / "t.db"
    db.init(path)
    conn = db.connect(path)
    chart = db.create_chart(conn, "A", {})
    new = db.reset_edit_key(conn, chart["id"])
    assert db.get_by_edit_key(conn, chart["edit_key"]) is None
    assert db.get_by_edit_key(conn, new)["name"] == "A"
    assert db.reset_edit_key(conn, 999) is None


def test_wal_is_opt_in(tmp_path):
    db.init(tmp_path / "plain.db")
    db.init(tmp_path / "wal.db", wal=True)
    mode = lambda p: sqlite3.connect(p).execute("PRAGMA journal_mode").fetchone()[0]
    assert mode(tmp_path / "plain.db") == "delete"
    assert mode(tmp_path / "wal.db") == "wal"
