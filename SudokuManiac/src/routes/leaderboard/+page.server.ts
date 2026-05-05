import type { PageServerLoad } from './$types';
import { getXpLeaderboard, getSpeedLeaderboard } from '$lib/server/leaderboard';

export const load: PageServerLoad = async () => {
	const [xp, speed] = await Promise.all([getXpLeaderboard(), getSpeedLeaderboard()]);
	return { xp, speed };
};
