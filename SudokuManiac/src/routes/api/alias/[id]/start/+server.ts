/** POST /api/alias/[id]/start — host starts the game. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { startAliasGame } from '$lib/server/alias/play';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as { token?: string };
	const token = typeof body.token === 'string' && body.token ? body.token : null;
	const session = await auth.api.getSession({ headers: request.headers });

	const res = await startAliasGame(params.id, token, session?.user?.id ?? null);
	if ('error' in res) {
		if (res.error === 'not_found') throw error(404, 'Room not found');
		if (res.error === 'not_host') throw error(403, 'Only the host can start');
		if (res.error === 'already_started') throw error(409, 'Game already started');
		if (res.error === 'need_two_teams') throw error(409, 'Need at least 2 teams with players');
		throw error(400, res.error);
	}
	return json(res);
};
