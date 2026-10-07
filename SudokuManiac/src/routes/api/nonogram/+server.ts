/**
 * GET  /api/nonogram — the library: recent puzzles with this player's status.
 * POST /api/nonogram — generate a puzzle: AI drawing → curated bank → procedural.
 */
import { json, error } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { generateNonogram, listNonograms } from '$lib/server/games/nonogram/service';
import { getLocale } from '$lib/paraglide/runtime';
import {
	NONOGRAM_DIFFICULTIES,
	NONOGRAM_SIZES,
	type NonogramDifficulty,
	type NonogramSize
} from '$lib/games/nonogram/types';

/**
 * Give generation an explicit function budget. adapter-vercel only emits a limit
 * when the route sets one, and runAi's own budget (about 40 s across the AI call and
 * its retry) must fit inside it with room left for the curated fallback.
 */
export const config: Config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ locals }) => {
	return json({ items: await listNonograms(locals.user?.id ?? null, getLocale()) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const size = Number(body.size) as NonogramSize;
	if (!NONOGRAM_SIZES.includes(size))
		throw error(400, `size must be one of ${NONOGRAM_SIZES.join(', ')}`);
	const difficulty = String(body.difficulty ?? 'medium') as NonogramDifficulty;
	if (!NONOGRAM_DIFFICULTIES.includes(difficulty)) throw error(400, 'invalid difficulty');
	const topic = typeof body.topic === 'string' ? body.topic : '';
	const language = typeof body.language === 'string' ? body.language : 'en';

	const result = await generateNonogram({
		topic,
		size,
		difficulty,
		language,
		userId: locals.user?.id ?? null
	});
	return json(result, { status: 201 });
};
