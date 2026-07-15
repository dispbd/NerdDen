/** POST /api/trivia/party/[code]/join — join a party lobby. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { joinParty } from '$lib/server/games/trivia/party';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as { name?: string; token?: string };
	const token = typeof body.token === 'string' && body.token ? body.token : null;
	if (!token) throw error(400, 'token is required');
	const name = (typeof body.name === 'string' ? body.name.trim() : '') || 'Player';

	const session = await auth.api.getSession({ headers: request.headers });
	const userId = session?.user?.id ?? null;

	const res = await joinParty(params.code.toUpperCase(), name, token, userId);
	if ('error' in res) {
		if (res.error === 'not_found') throw error(404, 'party not found');
		if (res.error === 'already_started') throw error(409, 'game already started');
		throw error(400, res.error);
	}
	return json(res);
};
