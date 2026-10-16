#!/bin/sh
set -eu
umask 077
mkdir -p backups
file="backups/lifetimeline-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db pg_dump -U lifetimeline -d lifetimeline -Fc > "$file.tmp"
mv "$file.tmp" "$file"
printf '%s\n' "$file"
