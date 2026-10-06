/** POST /api/alias/[id]/word — current speaker reports got_it / skip. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { submitWordResult } from '$lib/server/alias/play';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as { token?: string; result?: string };
	const token = typeof body.token === 'string' && body.token ? body.token : null;
	if (body.result !== 'got_it' && body.result !== 'skip') throw error(400, 'invalid result');

	const session = await auth.api.getSession({ headers: request.headers });
	const res = await submitWordResult(params.id, token, session?.user?.id ?? null, body.result);
	if ('error' in res) {
		if (res.error === 'not_found') throw error(404, 'Room not found');
		if (res.error === 'not_speaker') throw error(403, 'Only the current speaker can report a word');
		throw error(400, res.error);
	}
	return json(res);
};
