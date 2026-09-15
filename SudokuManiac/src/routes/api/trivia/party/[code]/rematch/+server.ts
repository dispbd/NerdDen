/** POST /api/trivia/party/[code]/rematch — host replays the room with a new quiz. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rematchParty } from '$lib/server/games/trivia/party';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as { token?: string };
	const token = typeof body.token === 'string' && body.token ? body.token : null;
	if (!token) throw error(400, 'token is required');

	const res = await rematchParty(params.code.toUpperCase(), token);
	if ('error' in res) {
		if (res.error === 'not_found') throw error(404, 'party not found');
		if (res.error === 'not_host') throw error(403, 'only the host can start a rematch');
		if (res.error === 'not_finished') throw error(409, 'quiz is not finished');
		throw error(400, res.error);
	}
	return json(res);
};
