/**
 * GET /api/health — is the app able to use its database?
 *
 * Two probes: a bare `select 1` (can we connect and authenticate at all?) and a read
 * from the auth `user` table (is the schema there?). A failure reports only the
 * driver's error code — a Postgres SQLSTATE like `28P01` (bad password) or `42P01`
 * (missing table), or a network code like `ENOTFOUND` — never the message, which can
 * carry hostnames or query text. Enough to tell "database paused / credentials
 * rotated / schema missing" apart without opening the platform's logs.
 */
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

type Probe = { ok: true; ms: number } | { ok: false; ms: number; code: string };

/** The driver's code from the error or its causes, if it looks like one. */
function errorCode(e: unknown): string {
	for (let cur = e, depth = 0; cur && depth < 4; depth++) {
		const code = (cur as { code?: unknown }).code;
		if (typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code)) return code;
		cur = (cur as { cause?: unknown }).cause;
	}
	return 'UNKNOWN';
}

async function probe(run: () => Promise<unknown>): Promise<Probe> {
	const start = Date.now();
	try {
		await run();
		return { ok: true, ms: Date.now() - start };
	} catch (e) {
		return { ok: false, ms: Date.now() - start, code: errorCode(e) };
	}
}

export const GET: RequestHandler = async () => {
	let connect: Probe;
	let schema: Probe | null = null;
	try {
		// Imported here so a missing DATABASE_URL is reported, not a crash on import.
		const { db } = await import('$lib/server/db');
		connect = await probe(() => db.execute(sql`select 1`));
		if (connect.ok) schema = await probe(() => db.execute(sql`select 1 from "user" limit 1`));
	} catch (e) {
		connect = { ok: false, ms: 0, code: errorCode(e) === 'UNKNOWN' ? 'CONFIG' : errorCode(e) };
	}
	const ok = connect.ok && !!schema?.ok;
	return json(
		{ ok, db: { connect, schema } },
		{ status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } }
	);
};
