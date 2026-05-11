import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStoryChapters } from '$lib/server/games/sudoku/story';

/** GET /api/sudoku/story — list chapters with user progress */
export const GET: RequestHandler = async ({ locals }) => {
	const chapters = await getStoryChapters(locals.user?.id ?? null);
	return json(chapters);
};
