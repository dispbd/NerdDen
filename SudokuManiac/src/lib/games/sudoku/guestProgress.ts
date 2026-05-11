/**
 * Browser-only localStorage helpers for guest (unauthenticated) stats,
 * achievements, and hints. Mirrors the server-side userStats / userAchievements
 * tables so the gameplay loop works identically for guests.
 */

import { ACHIEVEMENTS, type AchievementDef } from '$lib/games/sudoku/achievements';
import { calculateLevel } from '$lib/games/sudoku/achievements';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuestStats {
	sudokuSolved: number;
	sudokuPlayed: number;
	sudokuBestTimeSeconds: number | null;
	totalXp: number;
	level: number;
	hintsAvailable: number;
	streakDays: number;
	lastPlayedDate: string | null; // 'YYYY-MM-DD'
	earnedAchievementIds: string[];
}

export interface AwardResult {
	xpGained: number;
	levelUp: boolean;
	newLevel: number;
	hintsReplenished: number;
	newAchievements: { id: string; title: string; icon: string }[];
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const STATS_KEY = 'sudoku_guest_stats';

// ─── Load / Save ──────────────────────────────────────────────────────────────

export function loadGuestStats(): GuestStats {
	try {
		const raw = localStorage.getItem(STATS_KEY);
		if (raw) return JSON.parse(raw) as GuestStats;
	} catch {
		// ignore parse errors
	}
	return defaultStats();
}

function defaultStats(): GuestStats {
	return {
		sudokuSolved: 0,
		sudokuPlayed: 0,
		sudokuBestTimeSeconds: null,
		totalXp: 0,
		level: 1,
		hintsAvailable: 3,
		streakDays: 0,
		lastPlayedDate: null,
		earnedAchievementIds: []
	};
}

function persistStats(stats: GuestStats): void {
	localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// ─── Hints ────────────────────────────────────────────────────────────────────

/** Spend one hint; returns new count or null if none left. */
export function spendGuestHint(): number | null {
	const stats = loadGuestStats();
	if (stats.hintsAvailable <= 0) return null;
	stats.hintsAvailable--;
	persistStats(stats);
	return stats.hintsAvailable;
}

// ─── Solve recording ─────────────────────────────────────────────────────────

export interface SolveParams {
	difficulty: string;
	timeSpent: number;
	hintsUsed: number;
}

/** Record a completed solve and evaluate achievements. Returns award data. */
export function recordGuestSolve(params: SolveParams): AwardResult {
	const stats = loadGuestStats();

	// Update counters
	stats.sudokuSolved++;
	stats.sudokuPlayed++;
	if (stats.sudokuBestTimeSeconds === null || params.timeSpent < stats.sudokuBestTimeSeconds) {
		stats.sudokuBestTimeSeconds = params.timeSpent;
	}

	// Streak — compare today vs last play date
	const today = new Date().toISOString().slice(0, 10);
	if (stats.lastPlayedDate) {
		const daysDiff = Math.round(
			(new Date(today).getTime() - new Date(stats.lastPlayedDate).getTime()) /
				(1000 * 60 * 60 * 24)
		);
		if (daysDiff === 1) {
			stats.streakDays++;
		} else if (daysDiff > 1) {
			stats.streakDays = 1;
		}
	} else {
		stats.streakDays = 1;
	}
	stats.lastPlayedDate = today;

	// Evaluate achievements
	const earned = new Set(stats.earnedAchievementIds);
	const toAward: AchievementDef[] = [];
	for (const def of ACHIEVEMENTS) {
		if (earned.has(def.id)) continue;
		if (isUnlocked(def, stats, params)) {
			toAward.push(def);
		}
	}

	// XP for solve
	const DIFFICULTY_XP: Record<string, number> = {
		beginner: 20,
		easy: 35,
		medium: 50,
		hard: 75,
		expert: 110,
		extreme: 160
	};
	let xpGained = DIFFICULTY_XP[params.difficulty] ?? 50;

	// Bonus XP for achievements
	const achXp = toAward.reduce((s, a) => s + a.xpReward, 0);
	xpGained += achXp;

	const oldLevel = stats.level;
	stats.totalXp += xpGained;
	stats.level = calculateLevel(stats.totalXp);

	// Hints replenishment
	const HINTS_PER_SOLVE = 1;
	stats.hintsAvailable += HINTS_PER_SOLVE;

	// Commit new achievements
	for (const a of toAward) stats.earnedAchievementIds.push(a.id);

	persistStats(stats);

	return {
		xpGained,
		levelUp: stats.level > oldLevel,
		newLevel: stats.level,
		hintsReplenished: HINTS_PER_SOLVE,
		newAchievements: toAward.map((a) => ({ id: a.id, title: a.title, icon: a.icon }))
	};
}

// ─── Merge into server (call after login) ─────────────────────────────────────

/**
 * POST /api/sudoku/merge-guest — sends local stats to the server for merging.
 * Returns void; caller should clear local stats on success.
 */
export async function mergeGuestStateToServer(): Promise<boolean> {
	const stats = loadGuestStats();
	const res = await fetch('/api/sudoku/merge-guest', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(stats)
	});
	if (res.ok) {
		localStorage.removeItem(STATS_KEY);
		return true;
	}
	return false;
}

// ─── Achievement evaluation (client-side, mirrors engine.ts) ─────────────────

type StatsSnap = {
	sudokuSolved: number;
	streakDays: number;
};

function isUnlocked(def: AchievementDef, stats: StatsSnap, ctx: SolveParams): boolean {
	const { condition } = def;
	switch (condition.type) {
		case 'solve_count':
			return stats.sudokuSolved >= condition.count;
		case 'solve_difficulty':
			return ctx.difficulty === condition.difficulty;
		case 'solve_under_time':
			return ctx.timeSpent <= condition.seconds;
		case 'streak_days':
			return stats.streakDays >= condition.days;
		case 'hints_free':
			return ctx.hintsUsed === 0 && stats.sudokuSolved >= condition.count;
		default:
			return false;
	}
}
