/**
 * XP / level helpers. The level curve mirrors `calculateLevel`:
 *   level = floor(1 + sqrt(xp / 100))  ⇒  xpForLevel(L) = 100 · (L − 1)²
 */
import { calculateLevel } from '$lib/games/sudoku/achievements';

/** Total XP required to reach the start of a given level. */
export function xpForLevel(level: number): number {
	return 100 * Math.max(0, level - 1) ** 2;
}

export interface LevelProgress {
	level: number;
	/** XP accumulated within the current level */
	xpIntoLevel: number;
	/** XP span of the current level (next threshold − current threshold) */
	xpLevelSpan: number;
	/** XP still needed to reach the next level */
	xpRemaining: number;
	/** XP total required for the next level */
	nextLevelXp: number;
	/** Fill ratio 0–1 for the XP bar */
	ratio: number;
}

/** Derive level + progress-to-next-level details from a total XP value. */
export function levelProgress(totalXp: number): LevelProgress {
	const level = calculateLevel(totalXp);
	const currentThreshold = xpForLevel(level);
	const nextLevelXp = xpForLevel(level + 1);
	const xpLevelSpan = nextLevelXp - currentThreshold;
	const xpIntoLevel = totalXp - currentThreshold;
	const xpRemaining = Math.max(0, nextLevelXp - totalXp);
	return {
		level,
		xpIntoLevel,
		xpLevelSpan,
		xpRemaining,
		nextLevelXp,
		ratio: xpLevelSpan > 0 ? Math.min(1, xpIntoLevel / xpLevelSpan) : 1
	};
}
