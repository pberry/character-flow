"""Operator commands. There's no admin page: run these where the database lives.

    python -m app.admin list
    python -m app.admin reset-link ID [--base-url URL]

On Fly.io: fly ssh console -C "python -m app.admin list"

`reset-link` issues a new edit link and invalidates the old one. Edit keys are
stored only as hashes, so a lost link can be replaced but never looked up.
"""

import argparse
import os
import sys

from . import db

DEFAULT_BASE_URL = "https://characterflow.app"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--db", default=os.environ.get("CHARFLOW_DB", "charflow.db"))
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="every chart's id, name, and last update")
    reset = sub.add_parser("reset-link", help="issue a new edit link for a chart")
    reset.add_argument("id", type=int)
    reset.add_argument("--base-url", default=os.environ.get("CHARFLOW_BASE_URL", DEFAULT_BASE_URL))
    args = parser.parse_args(argv)

    db.init(args.db)
    conn = db.connect(args.db)
    try:
        if args.command == "list":
            for c in db.list_charts(conn):
                print(f"{c['id']:>5}  {c['updated_at']}  {c['name']}")
            return 0
        key = db.reset_edit_key(conn, args.id)
        if key is None:
            print(f"no chart with id {args.id}", file=sys.stderr)
            return 1
        print(f"{args.base_url.rstrip('/')}/#/edit/{key}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
