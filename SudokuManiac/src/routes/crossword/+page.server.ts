import { listCrosswords } from '$lib/server/games/crossword/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const recentCrosswords = await listCrosswords({ limit: 12 });
	return { recentCrosswords };
};
