#!/bin/sh
# Starts as root only to take ownership of /data (a new Fly volume is owned by
# root), then re-runs itself as the charflow user.
#
# With LITESTREAM_REPLICA_URL set (Fly.io), the database is restored from the
# replica when the volume is empty, and replicated for as long as the app runs.
# Without it (docker compose on the Mac), the command runs as given.
set -e

if [ "$(id -u)" = 0 ]; then
  chown charflow:charflow /data 2>/dev/null || true  # read-only for the backup service
  HOME=/home/charflow exec setpriv --reuid=1000 --regid=1000 --init-groups "$0" "$@"
fi

if [ -n "$LITESTREAM_REPLICA_URL" ] && [ "$1" = "gunicorn" ]; then
  litestream restore -if-db-not-exists -if-replica-exists "$CHARFLOW_DB"
  exec litestream replicate -exec "$*"
fi
exec "$@"
