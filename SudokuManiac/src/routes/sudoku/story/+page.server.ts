import type { PageServerLoad } from './$types';
import { getStoryChapters } from '$lib/server/games/sudoku/story';

export const load: PageServerLoad = async ({ locals }) => {
	const chapters = await getStoryChapters(locals.user?.id ?? null);
	return { chapters, userId: locals.user?.id ?? null };
};
