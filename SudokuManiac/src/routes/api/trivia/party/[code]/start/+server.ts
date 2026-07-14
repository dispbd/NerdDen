/** POST /api/trivia/party/[code]/start — host starts the game. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startParty } from '$lib/server/games/trivia/party';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as { token?: string };
	const token = typeof body.token === 'string' && body.token ? body.token : null;
	if (!token) throw error(400, 'token is required');

	const res = await startParty(params.code.toUpperCase(), token);
	if ('error' in res) {
		if (res.error === 'not_found') throw error(404, 'party not found');
		if (res.error === 'not_host') throw error(403, 'only the host can start');
		if (res.error === 'already_started') throw error(409, 'game already started');
		throw error(400, res.error);
	}
	return json(res);
};
