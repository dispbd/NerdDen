import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCrossword, getOrCreateSession } from '$lib/server/games/crossword/service';
import { auth } from '$lib/server/auth';

/** POST /api/crossword/[id]/sessions — start a new session */
export const POST: RequestHandler = async ({ params, request }) => {
	const crossword = await getCrossword(params.id);
	if (!crossword) throw error(404, 'Crossword not found');

	// Try to resolve user from session cookie (anonymous OK)
	const session = await auth.api.getSession({ headers: request.headers });
	const userId = session?.user?.id ?? null;

	const row = await getOrCreateSession(params.id, userId);
	return json(row, { status: 201 });
};
