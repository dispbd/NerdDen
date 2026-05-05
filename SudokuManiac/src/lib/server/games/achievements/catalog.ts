/**
 * Achievements catalog — static definitions seeded into the DB.
 * Condition shape: { type, [params] }
 */

export interface AchievementDef {
	id: string;
	title: string;
	description: string;
	icon: string;
	xpReward: number;
	condition: AchievementCondition;
}

export type AchievementCondition =
	| { type: 'solve_count'; count: number }
	| { type: 'solve_difficulty'; difficulty: string }
	| { type: 'solve_under_time'; seconds: number }
	| { type: 'streak_days'; days: number }
	| { type: 'hints_free'; count: number }; // solve N puzzles without hints

export const ACHIEVEMENTS: AchievementDef[] = [
	// ── First steps ─────────────────────────────────────────────
	{
		id: 'first_solve',
		title: 'First Solve',
		description: 'Complete your first Sudoku puzzle.',
		icon: '🎉',
		xpReward: 50,
		condition: { type: 'solve_count', count: 1 }
	},
	{
		id: 'ten_solves',
		title: 'Getting the Hang of It',
		description: 'Complete 10 Sudoku puzzles.',
		icon: '🔟',
		xpReward: 100,
		condition: { type: 'solve_count', count: 10 }
	},
	{
		id: 'fifty_solves',
		title: 'Puzzle Veteran',
		description: 'Complete 50 Sudoku puzzles.',
		icon: '🎖️',
		xpReward: 250,
		condition: { type: 'solve_count', count: 50 }
	},
	{
		id: 'hundred_solves',
		title: 'Centurion',
		description: 'Complete 100 Sudoku puzzles.',
		icon: '💯',
		xpReward: 500,
		condition: { type: 'solve_count', count: 100 }
	},

	// ── Difficulty mastery ──────────────────────────────────────
	{
		id: 'hard_solver',
		title: 'Hard Mode',
		description: 'Complete a Hard puzzle.',
		icon: '🔥',
		xpReward: 75,
		condition: { type: 'solve_difficulty', difficulty: 'hard' }
	},
	{
		id: 'expert_solver',
		title: 'Expert',
		description: 'Complete an Expert puzzle.',
		icon: '⭐',
		xpReward: 150,
		condition: { type: 'solve_difficulty', difficulty: 'expert' }
	},
	{
		id: 'extreme_solver',
		title: 'Extreme Mastery',
		description: 'Complete an Extreme puzzle.',
		icon: '💎',
		xpReward: 300,
		condition: { type: 'solve_difficulty', difficulty: 'extreme' }
	},

	// ── Speed ───────────────────────────────────────────────────
	{
		id: 'speed_5min',
		title: 'Quick Thinker',
		description: 'Solve a puzzle in under 5 minutes.',
		icon: '⚡',
		xpReward: 100,
		condition: { type: 'solve_under_time', seconds: 300 }
	},
	{
		id: 'speed_2min',
		title: 'Lightning Fast',
		description: 'Solve a puzzle in under 2 minutes.',
		icon: '🌩️',
		xpReward: 250,
		condition: { type: 'solve_under_time', seconds: 120 }
	},

	// ── Streaks ─────────────────────────────────────────────────
	{
		id: 'streak_3',
		title: 'On a Roll',
		description: 'Play 3 days in a row.',
		icon: '🔆',
		xpReward: 75,
		condition: { type: 'streak_days', days: 3 }
	},
	{
		id: 'streak_7',
		title: 'Week Warrior',
		description: 'Play 7 days in a row.',
		icon: '📅',
		xpReward: 200,
		condition: { type: 'streak_days', days: 7 }
	},
	{
		id: 'streak_30',
		title: 'Dedicated',
		description: 'Play 30 days in a row.',
		icon: '🗓️',
		xpReward: 750,
		condition: { type: 'streak_days', days: 30 }
	},

	// ── Hintless ────────────────────────────────────────────────
	{
		id: 'hintless_5',
		title: 'Purist',
		description: 'Solve 5 puzzles without using any hints.',
		icon: '🧠',
		xpReward: 150,
		condition: { type: 'hints_free', count: 5 }
	}
];
