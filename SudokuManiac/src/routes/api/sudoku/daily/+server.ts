import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDailyTask, getUserDailyStatus } from '$lib/server/games/sudoku/daily';

/** GET /api/sudoku/daily — returns today's task + user progress if signed in */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		const task = await getDailyTask();
		return json({ task, progress: null });
	}
	const { task, progress } = await getUserDailyStatus(locals.user.id);
	// Never expose the solution over the API
	const { solution: _sol, ...safeTask } = task;
	return json({ task: safeTask, progress });
};
