/** GET /api/alias/[id]/state?token=… — poll room + turn state (word hidden from non-speakers). */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { getAliasState } from '$lib/server/alias/play';

export const GET: RequestHandler = async ({ params, url, request }) => {
	const token = url.searchParams.get('token');
	const session = await auth.api.getSession({ headers: request.headers });
	const state = await getAliasState(params.id, token, session?.user?.id ?? null);
	if (!state) throw error(404, 'Room not found');
	return json(state);
};
