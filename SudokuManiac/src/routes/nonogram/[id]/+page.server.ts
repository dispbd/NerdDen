import { error } from '@sveltejs/kit';
import { getClientNonogram } from '$lib/server/games/nonogram/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Clues and reveals only — the solution never reaches the client before the game ends.
	const puzzle = await getClientNonogram(params.id);
	if (!puzzle) throw error(404, 'Nonogram not found');
	return { puzzle, signedIn: !!locals.user };
};
