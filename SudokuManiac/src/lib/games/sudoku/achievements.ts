/**
 * Browser-safe re-export of achievement definitions and shared helpers.
 * The catalog has no server dependencies and can be imported freely on the client.
 */
export type { AchievementDef, AchievementCondition } from '$lib/games/achievements/catalog';
export { ACHIEVEMENTS } from '$lib/games/achievements/catalog';

/** Mirror of the server-side calculateLevel. */
export function calculateLevel(xp: number): number {
	return Math.floor(1 + Math.sqrt(xp / 100));
}
