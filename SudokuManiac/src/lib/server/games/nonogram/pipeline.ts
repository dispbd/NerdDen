/**
 * Nonogram candidate pipeline: clean a drawn grid, gate it, and accept it only if
 * constraint propagation solves it — repairing with revealed cells when it stalls.
 *
 * Order matters (NONOGRAMS_PLAN.md §3): the gates run *after* cleanup, on the exact
 * grid that ships, and clues are computed from that grid too.
 *
 *   DESPECKLE → COMPONENTS → SHAPE + TRIVIALITY GATES → CLUES → ACCEPT / REPAIR
 */

import {
	EMPTY,
	FILLED,
	UNKNOWN,
	computeClues,
	propagate,
	solveDepth,
	type CellState,
	type Clue,
	type Grid,
	type PropagationResult
} from '$lib/games/nonogram/solver';
import type { NonogramDifficulty, Reveal } from '$lib/games/nonogram/types';

export type { Reveal };
export type Difficulty = NonogramDifficulty;

export interface Puzzle {
	grid: Grid;
	rowClues: Clue[];
	colClues: Clue[];
	reveals: Reveal[];
	difficulty: Difficulty;
	stats: { depth: number; firstRoundCoverage: number; sweeps: number; cellsChanged: number };
}

export type Rejection =
	| 'not_square'
	| 'empty_or_full'
	| 'fill_ratio'
	| 'too_few_patterns'
	| 'trivial'
	| 'fragmented'
	| 'cleanup_too_destructive'
	| 'unsolvable_without_guessing';

const at = (g: Grid, y: number, x: number) =>
	y >= 0 && y < g.length && x >= 0 && x < g[0].length ? g[y][x] : 0;

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Remove truly isolated dots and fill truly enclosed pinholes.
 *
 * A cell flips only when **all eight** neighbours disagree with it (outside the grid
 * counts as empty). The naive 4-neighbour rule erases every 1-pixel diagonal in one
 * pass — each diagonal cell has no orthogonal neighbours — and diagonals are everywhere
 * in picture art. With 8 neighbours a diagonal cell keeps its diagonal neighbours.
 * Double-buffered: every decision reads the original grid.
 */
export function despeckle(grid: Grid): { grid: Grid; changed: number } {
	let changed = 0;
	const out = grid.map((row, y) =>
		row.map((cell, x) => {
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if ((dy || dx) && at(grid, y + dy, x + dx) === cell) return cell;
				}
			}
			// (An empty border cell never gets here: its outside neighbours count as empty.)
			changed++;
			return cell ? 0 : 1;
		})
	);
	return { grid: out, changed };
}

/** Sizes of 8-connected filled components (8, so a diagonal stroke is one piece). */
export function componentSizes(grid: Grid): { sizes: number[]; label: number[][] } {
	const h = grid.length;
	const w = h ? grid[0].length : 0;
	const label = grid.map((row) => row.map(() => -1));
	const sizes: number[] = [];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (!grid[y][x] || label[y][x] !== -1) continue;
			const id = sizes.length;
			let size = 0;
			const stack = [[y, x]];
			label[y][x] = id;
			while (stack.length) {
				const [cy, cx] = stack.pop()!;
				size++;
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						const ny = cy + dy;
						const nx = cx + dx;
						if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
						if (!grid[ny][nx] || label[ny][nx] !== -1) continue;
						label[ny][nx] = id;
						stack.push([ny, nx]);
					}
				}
			}
			sizes.push(size);
		}
	}
	return { sizes, label };
}

export interface CleanResult {
	grid: Grid;
	cellsChanged: number;
	componentsDropped: number;
}

/**
 * Despeckle (10×10 and up — small grids have no room to spare a pixel) and drop
 * crumbs: components below 3 cells, or 2 on small grids where a pair can be an eye.
 */
export function cleanGrid(grid: Grid): CleanResult {
	const n = grid.length;
	let cellsChanged = 0;
	let g = grid.map((row) => row.slice());
	if (n >= 10) {
		const d = despeckle(g);
		g = d.grid;
		cellsChanged += d.changed;
	}
	const minSize = n < 10 ? 2 : 3;
	const { sizes, label } = componentSizes(g);
	let componentsDropped = 0;
	sizes.forEach((size, id) => {
		if (size >= minSize) return;
		componentsDropped++;
		cellsChanged += size;
		for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (label[y][x] === id) g[y][x] = 0;
	});
	return { grid: g, cellsChanged, componentsDropped };
}

// ─── Gates ───────────────────────────────────────────────────────────────────

/**
 * A line its clue alone fixes completely — no deduction needed. The `k === 0` case
 * matters: an all-empty line (exactly what a picture's margins produce) is the most
 * trivial line there is, and `sum + k - 1 === n` alone evaluates to -1 for it.
 */
export function lineIsFree(clue: readonly number[], n: number): boolean {
	const k = clue.length;
	if (k === 0) return true;
	return clue.reduce((a, b) => a + b, 0) + k - 1 === n;
}

/** Max share of free lines before a puzzle counts as trivial. Small grids are exempt. */
function maxFreeShare(n: number): number {
	if (n <= 5) return 1;
	if (n <= 10) return 0.4;
	return 0.35;
}

/** Cells cleanup may change before the result stops being "the picture that was drawn". */
function maxCellsChanged(n: number): number {
	return Math.ceil(0.03 * n * n);
}

function gate(clean: CleanResult, rowClues: Clue[], colClues: Clue[]): Rejection | null {
	const g = clean.grid;
	const n = g.length;
	const filled = g.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);

	if (clean.cellsChanged > maxCellsChanged(n) || clean.componentsDropped > 1) {
		return 'cleanup_too_destructive';
	}
	if (filled === 0 || filled === n * n) return 'empty_or_full';
	const ratio = filled / (n * n);
	if (ratio < 0.25 || ratio > 0.75) return 'fill_ratio';
	if (new Set(rowClues.map((c) => c.join(','))).size < 3) return 'too_few_patterns';

	const { sizes } = componentSizes(g);
	if (Math.max(...sizes) < 0.6 * filled) return 'fragmented';

	const free = [...rowClues, ...colClues].filter((c) => lineIsFree(c, n)).length;
	if (free / (2 * n) > maxFreeShare(n)) return 'trivial';
	return null;
}

// ─── Accept / repair ─────────────────────────────────────────────────────────

/**
 * Propagate; when it stalls, reveal the true value of one unknown cell in the line
 * with the fewest unknowns and try again, up to `maxReveals`. Each reveal fixes a
 * cell, so this terminates; revealing only adds information, so a solve stays unique.
 *
 * The returned result is propagation over `clues + reveals` — i.e. the accept test
 * re-run on exactly the artefact that will ship.
 */
export function repairWithReveals(
	grid: Grid,
	rowClues: Clue[],
	colClues: Clue[],
	maxReveals: number
): { reveals: Reveal[]; result: PropagationResult } | null {
	const reveals: Reveal[] = [];
	for (;;) {
		const initial: CellState[][] = grid.map((row) => row.map(() => UNKNOWN));
		for (const r of reveals) initial[r.y][r.x] = r.state === 'filled' ? FILLED : EMPTY;
		const result = propagate(rowClues, colClues, initial);

		if (result.status === 'solved') return { reveals, result };
		if (result.status === 'contradiction') {
			// The clues come from `grid` and the reveals are its true values: impossible.
			throw new Error('nonogram propagation contradicted its own source grid');
		}
		if (reveals.length >= maxReveals) return null;

		const cell = pickRevealCell(result.state);
		reveals.push({ x: cell.x, y: cell.y, state: grid[cell.y][cell.x] ? 'filled' : 'empty' });
	}
}

/** The first unknown cell of the line (row or column) with the fewest unknowns. */
function pickRevealCell(state: CellState[][]): { x: number; y: number } {
	const n = state.length;
	let best: { x: number; y: number } | null = null;
	let bestUnknowns = Infinity;
	for (let i = 0; i < n; i++) {
		let rowU = 0;
		let colU = 0;
		let rowFirst = -1;
		let colFirst = -1;
		for (let j = 0; j < n; j++) {
			if (state[i][j] === UNKNOWN) {
				rowU++;
				if (rowFirst < 0) rowFirst = j;
			}
			if (state[j][i] === UNKNOWN) {
				colU++;
				if (colFirst < 0) colFirst = j;
			}
		}
		if (rowU && rowU < bestUnknowns) {
			bestUnknowns = rowU;
			best = { x: rowFirst, y: i };
		}
		if (colU && colU < bestUnknowns) {
			bestUnknowns = colU;
			best = { x: i, y: colFirst };
		}
	}
	if (!best) throw new Error('pickRevealCell called on a solved state');
	return best;
}

/**
 * Map solve depth (see `solveDepth`) to a difficulty band, per board size — bigger
 * boards naturally take more rounds. Calibrated on the curated bank so that every
 * size has pictures in every band (asserted in curated.test.ts).
 */
const DEPTH_BANDS: Record<number, { easyMax: number; mediumMax: number }> = {
	5: { easyMax: 3, mediumMax: 4 },
	10: { easyMax: 3, mediumMax: 5 },
	15: { easyMax: 4, mediumMax: 5 }
};

export function gradeDifficulty(depth: number, size: number): Difficulty {
	const bands = DEPTH_BANDS[size] ?? DEPTH_BANDS[15];
	if (depth <= bands.easyMax) return 'easy';
	if (depth <= bands.mediumMax) return 'medium';
	return 'hard';
}

/** Solve depth of a puzzle as it ships: clues plus its reveals. */
export function depthOf(grid: Grid, rowClues: Clue[], colClues: Clue[], reveals: Reveal[]) {
	const initial: CellState[][] = grid.map((row) => row.map(() => UNKNOWN));
	for (const r of reveals) initial[r.y][r.x] = r.state === 'filled' ? FILLED : EMPTY;
	return solveDepth(rowClues, colClues, initial);
}

/**
 * Turn a drawn grid into a shippable puzzle, or say why not.
 * A puzzle the first synchronous round solves outright needs no cross-line reasoning
 * at all and is rejected as trivial, alongside the free-line gate.
 */
export function prepareCandidate(
	raw: Grid,
	opts: { maxReveals?: number } = {}
): { ok: true; puzzle: Puzzle } | { ok: false; reason: Rejection } {
	const n = raw.length;
	if (!n || raw.some((row) => row.length !== n)) return { ok: false, reason: 'not_square' };

	const clean = cleanGrid(raw);
	const { rowClues, colClues } = computeClues(clean.grid);
	const rejected = gate(clean, rowClues, colClues);
	if (rejected) return { ok: false, reason: rejected };

	const repaired = repairWithReveals(clean.grid, rowClues, colClues, opts.maxReveals ?? 3);
	if (!repaired) return { ok: false, reason: 'unsolvable_without_guessing' };
	const { reveals, result } = repaired;
	const depth = depthOf(clean.grid, rowClues, colClues, reveals);
	if (depth.rounds <= 1 && reveals.length === 0) return { ok: false, reason: 'trivial' };

	return {
		ok: true,
		puzzle: {
			grid: clean.grid,
			rowClues,
			colClues,
			reveals,
			difficulty: gradeDifficulty(depth.rounds, n),
			stats: {
				depth: depth.rounds,
				firstRoundCoverage: depth.firstRoundCoverage,
				sweeps: result.sweeps,
				cellsChanged: clean.cellsChanged
			}
		}
	};
}

const BAND_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

/** Max extra reveals spent making a puzzle easier — beyond this it stops being the same puzzle. */
const MAX_EASING_REVEALS = 8;

/**
 * Bring a puzzle down to the requested difficulty by revealing more cells.
 *
 * Each step reveals the cell determined *last* — the end of the longest deduction
 * chain — which is what shortens the chain. Reveals only add information, so the
 * puzzle stays uniquely solvable. A puzzle can only be made easier this way, never
 * harder; returns null when it is already easier than the target or easing runs out.
 */
export function easeToDifficulty(puzzle: Puzzle, target: Difficulty): Puzzle | null {
	const n = puzzle.grid.length;
	if (BAND_ORDER.indexOf(puzzle.difficulty) < BAND_ORDER.indexOf(target)) return null;
	const reveals = [...puzzle.reveals];
	for (let i = 0; i <= MAX_EASING_REVEALS; i++) {
		const depth = depthOf(puzzle.grid, puzzle.rowClues, puzzle.colClues, reveals);
		const grade = gradeDifficulty(depth.rounds, n);
		if (grade === target) {
			return {
				...puzzle,
				reveals,
				difficulty: grade,
				stats: {
					...puzzle.stats,
					depth: depth.rounds,
					firstRoundCoverage: depth.firstRoundCoverage
				}
			};
		}
		if (BAND_ORDER.indexOf(grade) < BAND_ORDER.indexOf(target)) return null; // overshot
		let latest = { x: -1, y: -1, round: -1 };
		depth.roundOf.forEach((row, y) =>
			row.forEach((round, x) => {
				if (round > latest.round) latest = { x, y, round };
			})
		);
		if (latest.round <= 0) return null;
		reveals.push({
			x: latest.x,
			y: latest.y,
			state: puzzle.grid[latest.y][latest.x] ? 'filled' : 'empty'
		});
	}
	return null;
}

/**
 * Choose among valid candidates for a requested difficulty — without dropping the
 * player's topic: an exact match wins; otherwise the nearest *harder* candidate is
 * eased down with reveals; otherwise the hardest available is used. The label is
 * always the puzzle's real grade, never the requested one.
 */
export function pickForDifficulty(candidates: Puzzle[], target: Difficulty): Puzzle | null {
	if (!candidates.length) return null;
	const exact = candidates.find((c) => c.difficulty === target);
	if (exact) return exact;
	const harder = candidates
		.filter((c) => BAND_ORDER.indexOf(c.difficulty) > BAND_ORDER.indexOf(target))
		.sort((a, b) => BAND_ORDER.indexOf(a.difficulty) - BAND_ORDER.indexOf(b.difficulty));
	for (const c of harder) {
		const eased = easeToDifficulty(c, target);
		if (eased) return eased;
	}
	return [...candidates].sort((a, b) => b.stats.depth - a.stats.depth)[0];
}
