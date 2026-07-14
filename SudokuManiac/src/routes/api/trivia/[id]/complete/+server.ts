/** POST /api/trivia/[id]/complete — finalize a session and return its summary. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { completeTriviaGame } from '$lib/server/games/trivia/service';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as { timeSpent?: number };
	const timeSpent = Number(body.timeSpent);

	const summary = await completeTriviaGame(params.id, Number.isFinite(timeSpent) ? timeSpent : 0);
	if (!summary) throw error(404, 'session not found');

	return json(summary);
};
