/**
 * Reveal helper — returns the correct letter(s) for a cell or a whole word.
 * Answers are stripped from the client payload, so reveals go through the server.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCrossword } from '$lib/server/games/crossword/service';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		mode?: 'letter' | 'word';
		row?: number;
		col?: number;
		clueNumber?: number;
		direction?: 'across' | 'down';
	};

	const cw = await getCrossword(params.id);
	if (!cw) throw error(404, 'Crossword not found');

	const grid = cw.grid as string[][];
	const cells: { r: number; c: number; letter: string }[] = [];

	if (body.mode === 'word' && body.clueNumber != null && body.direction) {
		const clue = cw.clues.find(
			(c) => c.number === body.clueNumber && c.direction === body.direction
		);
		if (clue) {
			const dr = body.direction === 'down' ? 1 : 0;
			const dc = body.direction === 'across' ? 1 : 0;
			for (let i = 0; i < clue.length; i++) {
				const r = clue.row + dr * i;
				const c = clue.col + dc * i;
				const letter = grid[r]?.[c];
				if (letter && letter !== '#') cells.push({ r, c, letter: letter.toUpperCase() });
			}
		}
	} else if (body.row != null && body.col != null) {
		const letter = grid[body.row]?.[body.col];
		if (letter && letter !== '#') cells.push({ r: body.row, c: body.col, letter: letter.toUpperCase() });
	}

	return json({ cells });
};
