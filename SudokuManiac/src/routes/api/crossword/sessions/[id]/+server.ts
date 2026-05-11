import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	saveSessionProgress,
	completeSession,
	getCrossword
} from '$lib/server/games/crossword/service';
import { db } from '$lib/server/db';
import { crosswordSessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/** PATCH /api/crossword/sessions/[id] — save progress or complete */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => ({}));

	const session = await db.query.crosswordSessions.findFirst({
		where: eq(crosswordSessions.id, params.id)
	});
	if (!session) throw error(404, 'Session not found');

	const playerGrid: Record<string, string> = body?.playerGrid ?? session.playerGrid ?? {};
	const timeSpent: number = Number(body?.timeSpent ?? session.timeSpent ?? 0);
	const complete: boolean = body?.complete === true;

	if (complete) {
		const hintsUsed: number = Number(body?.hintsUsed ?? session.hintsUsed ?? 0);

		// Validate completion against the real grid
		const crossword = await getCrossword(session.crosswordId as string);
		if (!crossword) throw error(404, 'Crossword not found');

		let allCorrect = true;
		for (const clue of crossword.clues) {
			const dr = clue.direction === 'down' ? 1 : 0;
			const dc = clue.direction === 'across' ? 1 : 0;
			for (let i = 0; i < clue.length; i++) {
				const key = `${clue.row + dr * i},${clue.col + dc * i}`;
				if ((playerGrid[key] ?? '').toUpperCase() !== clue.answer[i]) {
					allCorrect = false;
					break;
				}
			}
			if (!allCorrect) break;
		}

		if (!allCorrect) throw error(422, 'Puzzle not fully or correctly solved');

		await completeSession(params.id, playerGrid, timeSpent, hintsUsed);
		return json({ status: 'completed' });
	}

	await saveSessionProgress(params.id, playerGrid, timeSpent);
	return json({ status: 'saved' });
};
