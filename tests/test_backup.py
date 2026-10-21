import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from app import backup, db

T0 = datetime(2026, 10, 1, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def live(tmp_path):
    path = tmp_path / "live.db"
    db.init(path)
    with db.connect(path) as conn:
        db.create_chart(conn, "Meren", {"boxes": [{"id": "b1"}]})
    return path


def charts_in(path):
    with sqlite3.connect(path) as conn:
        return [r[0] for r in conn.execute("SELECT name FROM charts ORDER BY id")]


def test_snapshot_copies_the_data(live, tmp_path):
    made = backup.snapshot(live, tmp_path / "b", now=T0)
    assert made.name == "charflow-20261001-120000.db"
    assert charts_in(made) == ["Meren"]
    assert not list((tmp_path / "b").glob(".*tmp"))


def test_unchanged_data_is_skipped(live, tmp_path):
    dest = tmp_path / "b"
    assert backup.snapshot(live, dest, now=T0)
    assert backup.snapshot(live, dest, now=T0 + timedelta(hours=1)) is None
    with db.connect(live) as conn:
        db.create_chart(conn, "Brakka", {})
    made = backup.snapshot(live, dest, now=T0 + timedelta(hours=2))
    assert charts_in(made) == ["Meren", "Brakka"]
    assert len(backup.list_backups(dest)) == 2


def test_snapshot_never_touches_the_live_file(live, tmp_path):
    before = live.read_bytes()
    backup.snapshot(live, tmp_path / "b", now=T0)
    assert live.read_bytes() == before


def test_missing_database_is_an_error(tmp_path):
    with pytest.raises(FileNotFoundError):
        backup.snapshot(tmp_path / "nope.db", tmp_path / "b")
    assert not (tmp_path / "nope.db").exists()


def test_prune_keeps_newest_and_one_per_day(tmp_path):
    dest = tmp_path / "b"
    dest.mkdir()
    # Four snapshots a day for five days, plus one very old one.
    stamps = [T0 - timedelta(days=200)] + [T0 + timedelta(days=d, hours=h) for d in range(5) for h in (0, 3, 6, 9)]
    for s in stamps:
        (dest / f"charflow-{s:%Y%m%d-%H%M%S}.db").write_bytes(b"")
    (dest / "notes.txt").write_text("not a backup")
    now = T0 + timedelta(days=5)
    deleted = backup.prune(dest, keep=6, days=90, now=now)
    left = backup.list_backups(dest)
    # Newest 6 (days 3 and 4 partly), plus the last of days 0, 1, 2; the 200-day-old one goes.
    assert len(left) == 6 + 3
    assert not (dest / f"charflow-{stamps[0]:%Y%m%d-%H%M%S}.db").exists()
    assert len(deleted) == len(stamps) - len(left)
    assert (dest / "notes.txt").exists()


def test_main_runs_once(live, tmp_path, capsys):
    assert backup.main(["--db", str(live), "--dest", str(tmp_path / "b")]) == 0
    assert "backup: charflow-" in capsys.readouterr().out
    assert len(backup.list_backups(tmp_path / "b")) == 1


def test_restore_replaces_data_and_saves_the_old(live, tmp_path):
    dest = tmp_path / "b"
    old = backup.snapshot(live, dest, now=T0)
    with db.connect(live) as conn:
        db.create_chart(conn, "Brakka", {})
    before = backup.restore(live, old, dest, now=T0 + timedelta(hours=1))
    assert charts_in(live) == ["Meren"]
    assert charts_in(before) == ["Meren", "Brakka"]
    # The restored database still works with the app.
    with db.connect(live) as conn:
        assert db.get_chart(conn, 1)["data"] == {"boxes": [{"id": "b1"}]}


def test_restore_rejects_a_bad_file(live, tmp_path):
    junk = tmp_path / "junk.db"
    junk.write_bytes(b"not a database at all" * 100)
    with pytest.raises(sqlite3.DatabaseError):
        backup.restore(live, junk, tmp_path / "b")
    empty = tmp_path / "empty.db"
    sqlite3.connect(empty).close()
    with pytest.raises(RuntimeError, match="no charts table"):
        backup.restore(live, empty, tmp_path / "b")
    assert charts_in(live) == ["Meren"]
