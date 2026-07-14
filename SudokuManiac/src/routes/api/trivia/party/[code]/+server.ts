/** GET /api/trivia/party/[code]?token=… — poll party state (answers hidden). */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPartyState } from '$lib/server/games/trivia/party';

export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('token') ?? undefined;
	const state = await getPartyState(params.code.toUpperCase(), token);
	if (!state) throw error(404, 'party not found');
	return json(state);
};
