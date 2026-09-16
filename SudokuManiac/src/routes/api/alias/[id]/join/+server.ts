/** POST /api/alias/[id]/join — join (or switch to) a team. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { joinAliasTeam } from '$lib/server/alias/play';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		teamId?: string;
		name?: string;
		token?: string;
	};
	const token = typeof body.token === 'string' && body.token ? body.token : null;
	const teamId = typeof body.teamId === 'string' && body.teamId ? body.teamId : null;
	if (!token) throw error(400, 'token is required');
	if (!teamId) throw error(400, 'teamId is required');
	const name = (typeof body.name === 'string' ? body.name.trim() : '') || 'Player';

	const session = await auth.api.getSession({ headers: request.headers });
	const res = await joinAliasTeam(params.id, teamId, name, token, session?.user?.id ?? null);
	if ('error' in res) {
		if (res.error === 'not_found') throw error(404, 'Room not found');
		if (res.error === 'already_started') throw error(409, 'Game already started');
		throw error(400, res.error);
	}
	return json(res);
};
