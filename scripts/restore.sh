#!/bin/sh
set -eu
if [ "$#" -ne 2 ] || [ "$2" != "--replace-database" ]; then
  echo 'Usage: sh scripts/restore.sh BACKUP.dump --replace-database (destructive restore)' >&2
  exit 2
fi
[ -f "$1" ]
docker compose stop app
docker compose exec -T db pg_restore -U lifetimeline -d lifetimeline --clean --if-exists --exit-on-error --single-transaction < "$1"
# Invalidate any sessions contained in the restored backup.
docker compose exec -T db psql -U lifetimeline -d lifetimeline -v ON_ERROR_STOP=1 -c 'DELETE FROM sessions;'
echo 'Restored. Select the matching application image before starting app.'
