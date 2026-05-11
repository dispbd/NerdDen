import type { PageServerLoad } from './$types';
import { getActiveSessions } from '$lib/server/games/sudoku/sessions';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { activeSessions: [], isAuthenticated: false };
	const activeSessions = await getActiveSessions(locals.user.id);
	return { activeSessions, isAuthenticated: true };
};
