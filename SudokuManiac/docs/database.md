# Production database: setup, backups, restore

Production runs on Postgres at Supabase. The schema lives in git
(`drizzle/migrations`), and a nightly GitHub Action stores an encrypted dump.
Either one alone rebuilds the database on any Postgres host.

Health check after any change: `https://<domain>/api/health` must answer `"ok": true`.
It reports only error codes, e.g. `42P01` = tables missing, `28P01` = wrong password.

## Connection strings

Supabase → your project → **Connect** (top bar). Three strings are offered; two are used:

| Use                           | String                 | Port | Where it goes                                   |
| ----------------------------- | ---------------------- | ---- | ----------------------------------------------- |
| The app on Vercel             | **Transaction pooler** | 6543 | Vercel env `DATABASE_URL`                       |
| Migrations, backups, restores | **Session pooler**     | 5432 | your shell; GitHub secret `BACKUP_DATABASE_URL` |

Not the **Direct connection** (`db.<ref>.supabase.co`): on the free plan it is IPv6-only,
and GitHub's runners have no IPv6. Replace `[YOUR-PASSWORD]` with the database
password (Project Settings → Database → reset it there if it is lost).

The app connects with `prepare: false` (see `src/lib/server/db/index.ts`), which the
transaction pooler requires.

## First-time setup

1. **Create the project** at supabase.com. Pick the region nearest the Vercel functions
   (Vercel → Project → Settings → Functions → Region; the default `iad1` is
   Washington, D.C. → Supabase "East US").
2. **Create the schema** from `SudokuManiac/`:
   ```bash
   DATABASE_URL="<session pooler string>" npx drizzle-kit migrate
   ```
3. **Point Vercel at it.** Vercel → Project → Settings → Environment Variables →
   `DATABASE_URL` = transaction pooler string, for Production and Preview. If a
   Neon/Postgres integration is still connected (Storage tab), disconnect it first —
   integrations own their variables and would overwrite yours. Redeploy, then check
   `/api/health`.
4. **Backups.** GitHub → repo → Settings → Secrets and variables → Actions → New
   repository secret:
   - `BACKUP_DATABASE_URL` = session pooler string
   - `BACKUP_PASSPHRASE` = a long random string, e.g. from `openssl rand -base64 32`.
     **Save a copy in a password manager**: without it no backup can be decrypted.
5. **Run the first backup by hand:** Actions → _Database backup_ → Run workflow. A
   green run leaves an artifact `db-backup-<run id>`. After that it runs nightly at
   03:17 UTC; a failure e-mails you.

GitHub pauses scheduled workflows in public repositories after 60 days without any
commit. If it ever stops, Actions → _Database backup_ → Enable workflow.

## Restore

1. Actions → _Database backup_ → pick a run → download the artifact and unzip it →
   `nerdden-<timestamp>.dump.gpg`.
2. From `SudokuManiac/` (needs Docker and gpg — Git for Windows includes gpg):
   ```bash
   DATABASE_URL="<session pooler string>" BACKUP_PASSPHRASE="<passphrase>" \
     scripts/db-restore.sh path/to/nerdden-<timestamp>.dump.gpg
   ```
   It drops and recreates the app's tables in that database, then loads the data.
   Restoring into a brand-new database works the same way; the schema comes with it.
3. Check `/api/health`.

A manual backup any time: `DATABASE_URL=… BACKUP_PASSPHRASE=… scripts/db-backup.sh`.

## Changing the schema

1. Edit `src/lib/server/db/schema.ts`.
2. Locally: `npm run db:push`, or apply the change as direct DDL if push proposes something odd.
3. `npx drizzle-kit generate --name <what-changed>` (any `DATABASE_URL` value will do —
   generate reads only the schema files) and commit the new file in `drizzle/migrations`.
4. After the merge: `DATABASE_URL="<session pooler string>" npx drizzle-kit migrate`.
