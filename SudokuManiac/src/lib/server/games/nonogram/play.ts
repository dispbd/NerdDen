/**
 * Server-side rules for playing a nonogram. Pure — no DB — so they are testable.
 *
 * The solution never reaches the client, so every fill is judged here: a correct fill
 * sticks, a wrong one costs a mistake and the cell is crossed out for the player
 * (it is now known to be empty). The game is lost at MAX_MISTAKES.
 */

import {
	MAX_MISTAKES,
	cellKey,
	type NonogramMove,
	type PlayerGrid,
	type Reveal
} from '$lib/games/nonogram/types';

export type Move = NonogramMove;

export type PlayStatus = 'in_progress' | 'completed' | 'failed';

export interface PlayState {
	playerGrid: PlayerGrid;
	mistakes: number;
	status: PlayStatus;
}

export interface MoveOutcome extends PlayState {
	/** Cells the player tried to fill that are empty in the solution. */
	wrong: { x: number; y: number }[];
}

const lockedSet = (reveals: readonly Reveal[]) => new Set(reveals.map((r) => cellKey(r.x, r.y)));

export function isComplete(
	solution: number[][],
	reveals: readonly Reveal[],
	grid: PlayerGrid
): boolean {
	const revealedFilled = new Set(
		reveals.filter((r) => r.state === 'filled').map((r) => cellKey(r.x, r.y))
	);
	for (let y = 0; y < solution.length; y++) {
		for (let x = 0; x < solution[y].length; x++) {
			if (!solution[y][x]) continue;
			const k = cellKey(x, y);
			if (grid[k] !== 'filled' && !revealedFilled.has(k)) return false;
		}
	}
	return true;
}

/** Apply a batch of moves in order. Moves after the game ends are ignored. */
export function applyMoves(
	solution: number[][],
	reveals: readonly Reveal[],
	state: PlayState,
	moves: readonly Move[]
): MoveOutcome {
	const n = solution.length;
	const locked = lockedSet(reveals);
	const grid: PlayerGrid = { ...state.playerGrid };
	let { mistakes, status } = state;
	const wrong: { x: number; y: number }[] = [];

	for (const m of moves) {
		if (status !== 'in_progress') break;
		if (!Number.isInteger(m.x) || !Number.isInteger(m.y)) continue;
		if (m.x < 0 || m.y < 0 || m.x >= n || m.y >= n) continue;
		const k = cellKey(m.x, m.y);
		if (locked.has(k)) continue;

		if (m.action === 'fill') {
			if (grid[k] === 'filled') continue;
			if (solution[m.y][m.x]) {
				grid[k] = 'filled';
				if (isComplete(solution, reveals, grid)) status = 'completed';
			} else {
				mistakes++;
				grid[k] = 'marked';
				wrong.push({ x: m.x, y: m.y });
				if (mistakes >= MAX_MISTAKES) status = 'failed';
			}
		} else if (m.action === 'mark') {
			// A confirmed fill can't be crossed out — it is known to be filled.
			if (grid[k] !== 'filled') grid[k] = 'marked';
		} else if (m.action === 'clear') {
			delete grid[k];
		}
	}
	return { playerGrid: grid, mistakes, status, wrong };
}

/**
 * A hint fills one correct cell: from the row that is closest to done, so the hint
 * moves the player forward rather than revealing something random.
 */
export function pickHintCell(
	solution: number[][],
	reveals: readonly Reveal[],
	grid: PlayerGrid
): { x: number; y: number } | null {
	const locked = lockedSet(reveals);
	let best: { x: number; y: number } | null = null;
	let bestRemaining = Infinity;
	for (let y = 0; y < solution.length; y++) {
		const missing: number[] = [];
		for (let x = 0; x < solution[y].length; x++) {
			const k = cellKey(x, y);
			if (solution[y][x] && grid[k] !== 'filled' && !locked.has(k)) missing.push(x);
		}
		if (missing.length && missing.length < bestRemaining) {
			bestRemaining = missing.length;
			best = { x: missing[0], y };
		}
	}
	return best;
}

/** Share (0–100) of the picture's filled cells the player has found. */
export function progressOf(
	solution: number[][],
	reveals: readonly Reveal[],
	grid: PlayerGrid
): number {
	const revealedFilled = new Set(
		reveals.filter((r) => r.state === 'filled').map((r) => cellKey(r.x, r.y))
	);
	let total = 0;
	let found = 0;
	for (let y = 0; y < solution.length; y++) {
		for (let x = 0; x < solution[y].length; x++) {
			if (!solution[y][x]) continue;
			total++;
			const k = cellKey(x, y);
			if (grid[k] === 'filled' || revealedFilled.has(k)) found++;
		}
	}
	return total ? Math.round((found / total) * 100) : 0;
}
