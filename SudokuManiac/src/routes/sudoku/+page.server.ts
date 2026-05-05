import type { PageServerLoad } from './$types';
import { getActiveSession } from '$lib/server/games/sudoku/sessions';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { activeSession: null };
	const activeSession = await getActiveSession(locals.user.id);
	return { activeSession: activeSession ?? null };
};
