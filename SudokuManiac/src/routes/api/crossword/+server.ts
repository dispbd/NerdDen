import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAndSaveCrossword, listCrosswords } from '$lib/server/games/crossword/service';

/** GET /api/crossword — list recent crosswords */
export const GET: RequestHandler = async ({ url }) => {
	const language = url.searchParams.get('language') ?? undefined;
	const difficulty = url.searchParams.get('difficulty') ?? undefined;
	const topic = url.searchParams.get('topic') ?? undefined;
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 50);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	const items = await listCrosswords({ language, difficulty, topic, limit, offset });
	return json({ items });
};

/** POST /api/crossword — generate a new crossword via AI */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const topic = typeof body?.topic === 'string' && body.topic.trim() ? body.topic.trim() : null;
	if (!topic) throw error(400, 'topic is required');

	const language = typeof body?.language === 'string' ? body.language : 'en';
	const difficulty = typeof body?.difficulty === 'string' ? body.difficulty : 'medium';

	const allowed = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];
	if (!allowed.includes(difficulty)) throw error(400, 'invalid difficulty');

	const crossword = await createAndSaveCrossword(topic, language, difficulty);
	return json(crossword, { status: 201 });
};
