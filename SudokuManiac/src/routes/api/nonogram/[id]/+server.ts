/** GET /api/nonogram/[id] — the puzzle as the client sees it (no solution). */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClientNonogram } from '$lib/server/games/nonogram/service';

export const GET: RequestHandler = async ({ params }) => {
	const puzzle = await getClientNonogram(params.id);
	if (!puzzle) throw error(404, 'Nonogram not found');
	return json(puzzle);
};
