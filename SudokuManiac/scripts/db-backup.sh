#!/usr/bin/env bash
# Dump the app's database, check the dump, and encrypt it.
#
#   DATABASE_URL=...  BACKUP_PASSPHRASE=...  scripts/db-backup.sh [out-dir]
#
# Writes <out-dir>/nerdden-<UTC timestamp>.dump.gpg (default out-dir: ./backups).
# Runs pg_dump in the official postgres image, so the client is always at least as
# new as the server (pg_dump refuses to dump a newer server).
#
# Only the app's schemas are dumped: `public` (all tables) and `drizzle` (the
# migration journal). A provider's own schemas (Supabase's auth, storage, …) would
# only get in the way of restoring elsewhere.
#
# The repository is public and dumps hold e-mails and password hashes, so the file
# is encrypted (AES-256, symmetric) before it goes anywhere. See docs/database.md.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
PG_IMAGE="${PG_IMAGE:-postgres:18}"
OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"

stamp="$(date -u +%Y%m%d-%H%M%S)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Dumping with $PG_IMAGE…"
docker run --rm -e DATABASE_URL "$PG_IMAGE" \
	sh -c 'pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=drizzle "$DATABASE_URL"' \
	> "$work/db.dump"

# A dump of an empty database succeeds too — that is exactly how the last outage
# went unnoticed. Refuse to store one without the core table.
docker run --rm -i "$PG_IMAGE" pg_restore --list < "$work/db.dump" > "$work/toc.txt"
if ! grep -qE 'TABLE (DATA )?public user ' "$work/toc.txt"; then
	echo "::error::The dump has no public.user table — the database looks empty or wrong. Not storing it." >&2
	exit 1
fi
tables="$(grep -cE ' TABLE public ' "$work/toc.txt" || true)"
echo "Dump OK: $tables tables, $(wc -c < "$work/db.dump") bytes."

printf '%s' "$BACKUP_PASSPHRASE" > "$work/pass"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$work/pass" \
	--symmetric --cipher-algo AES256 \
	-o "$OUT_DIR/nerdden-$stamp.dump.gpg" "$work/db.dump"
echo "Wrote $OUT_DIR/nerdden-$stamp.dump.gpg"
