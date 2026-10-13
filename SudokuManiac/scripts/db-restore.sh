#!/usr/bin/env bash
# Restore an encrypted backup made by db-backup.sh into a database.
#
#   DATABASE_URL=...  BACKUP_PASSPHRASE=...  scripts/db-restore.sh nerdden-….dump.gpg
#
# Use the DIRECT (non-pooled) connection string. Tables that already exist in the
# app's schemas are dropped and recreated (--clean --if-exists), so point this at
# the database you mean to overwrite. See docs/database.md.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
file="${1:?usage: db-restore.sh <backup.dump.gpg>}"
PG_IMAGE="${PG_IMAGE:-postgres:18}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

printf '%s' "$BACKUP_PASSPHRASE" > "$work/pass"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$work/pass" \
	-o "$work/db.dump" -d "$file"

docker run --rm -i -e DATABASE_URL "$PG_IMAGE" \
	sh -c 'pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error -d "$DATABASE_URL"' \
	< "$work/db.dump"
echo "Restored $file"
