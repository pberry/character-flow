"""Snapshots of the chart database.

Uses SQLite's online backup API, which is safe while the app is running, and
opens the live database read-only so a backup can never change it. A snapshot
is only kept when the data differs from the newest one, and old snapshots are
thinned out: the newest `keep` are kept, plus the newest of each day for `days`
days.

    python -m app.backup --db /data/charflow.db --dest /backups [--every 3600]
    python -m app.backup --db /data/charflow.db --dest /backups --restore FILE
"""

import argparse
import hashlib
import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

PREFIX = "charflow-"
SUFFIX = ".db"
STAMP = "%Y%m%d-%H%M%S"


def _digest(path):
    """Hash of the database contents (not the file bytes, which can differ)."""
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        h = hashlib.sha256()
        for line in conn.iterdump():
            h.update(line.encode())
        return h.hexdigest()
    finally:
        conn.close()


def _stamp_of(path):
    try:
        return datetime.strptime(path.name[len(PREFIX):-len(SUFFIX)], STAMP).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def list_backups(dest):
    """Snapshots in `dest`, oldest first. Other files are ignored."""
    found = [(s, p) for p in Path(dest).glob(f"{PREFIX}*{SUFFIX}") if (s := _stamp_of(p))]
    return [p for _, p in sorted(found)]


def snapshot(db_path, dest, now=None):
    """Copy the database into `dest`. Returns the new file, or None when the
    data hasn't changed since the newest snapshot."""
    if not Path(db_path).exists():
        raise FileNotFoundError(db_path)
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    now = now or datetime.now(timezone.utc)
    final = dest / f"{PREFIX}{now.strftime(STAMP)}{SUFFIX}"
    tmp = dest / f".{final.name}.tmp"
    src = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        out = sqlite3.connect(tmp)
        try:
            src.backup(out)
            ok = out.execute("PRAGMA integrity_check").fetchone()[0]
        finally:
            out.close()
    finally:
        src.close()
    if ok != "ok":
        tmp.unlink()
        raise RuntimeError(f"backup failed integrity check: {ok}")
    existing = list_backups(dest)
    if existing and _digest(existing[-1]) == _digest(tmp):
        tmp.unlink()
        return None
    os.replace(tmp, final)
    return final


def prune(dest, keep=48, days=90, now=None):
    """Delete snapshots that are not among the newest `keep` and not the newest
    of their day within the last `days` days. Returns the deleted files."""
    backups = list_backups(dest)
    now = now or datetime.now(timezone.utc)
    keepers = set(backups[-keep:]) if keep > 0 else set()
    newest_of_day = {}
    for p in backups:
        newest_of_day[_stamp_of(p).date()] = p
    cutoff = (now - timedelta(days=days)).date()
    keepers.update(p for day, p in newest_of_day.items() if day >= cutoff)
    deleted = [p for p in backups if p not in keepers]
    for p in deleted:
        p.unlink()
    return deleted


def restore(db_path, snap, dest, now=None):
    """Replace the database's contents with snapshot `snap`. The current data is
    snapshotted into `dest` first, so a restore can itself be undone. Returns
    that snapshot (None if the current data was already backed up)."""
    snap = Path(snap)
    if not snap.exists():
        raise FileNotFoundError(snap)
    src = sqlite3.connect(f"file:{snap}?mode=ro", uri=True)
    try:
        ok = src.execute("PRAGMA integrity_check").fetchone()[0]
        if ok != "ok":
            raise RuntimeError(f"{snap.name} failed integrity check: {ok}")
        if not src.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'charts'").fetchone():
            raise RuntimeError(f"{snap.name} has no charts table")
        before = snapshot(db_path, dest, now=now) if Path(db_path).exists() else None
        out = sqlite3.connect(db_path)
        try:
            src.backup(out)
        finally:
            out.close()
    finally:
        src.close()
    return before


def run_once(db_path, dest, keep, days):
    made = snapshot(db_path, dest)
    deleted = prune(dest, keep=keep, days=days)
    print(f"backup: {made.name if made else 'unchanged, skipped'}; pruned {len(deleted)}", flush=True)
    return made


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--db", default=os.environ.get("CHARFLOW_DB", "charflow.db"))
    parser.add_argument("--dest", default=os.environ.get("CHARFLOW_BACKUP_DIR", "backups"))
    parser.add_argument("--keep", type=int, default=int(os.environ.get("CHARFLOW_BACKUP_KEEP", 48)))
    parser.add_argument("--days", type=int, default=int(os.environ.get("CHARFLOW_BACKUP_DAYS", 90)))
    parser.add_argument("--every", type=int, default=0, help="repeat every N seconds (default: run once)")
    parser.add_argument("--restore", metavar="FILE", help="replace the database with this snapshot (stop the app first)")
    args = parser.parse_args(argv)
    if args.restore:
        before = restore(args.db, args.restore, args.dest)
        saved = f"previous data saved as {before.name}" if before else "previous data was already backed up"
        print(f"restored {Path(args.restore).name}; {saved}", flush=True)
        return 0
    while True:
        try:
            run_once(args.db, args.dest, args.keep, args.days)
        except Exception as e:  # keep the loop alive; the next run may succeed
            print(f"backup: FAILED: {e}", file=sys.stderr, flush=True)
            if not args.every:
                return 1
        if not args.every:
            return 0
        time.sleep(args.every)


if __name__ == "__main__":
    sys.exit(main())
