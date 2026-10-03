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
	type CellState,
	type Clue,
	type Grid,
	type PropagationResult
} from '$lib/games/nonogram/solver';

/**
 * A cell revealed to the player before they start. Tri-state on purpose: when
 * propagation stalls, the revealed cell is EMPTY about half the time, and dropping
 * those would ship a puzzle that is not uniquely solvable from its own data.
 */
export interface Reveal {
	x: number;
	y: number;
	state: 'filled' | 'empty';
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Puzzle {
	grid: Grid;
	rowClues: Clue[];
	colClues: Clue[];
	reveals: Reveal[];
	difficulty: Difficulty;
	stats: { sweeps: number; firstSweepDetermined: number; cellsChanged: number };
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

/** Map propagation effort to a difficulty band. Thresholds are tuned in N2 on real art. */
export function gradeDifficulty(sweeps: number): Difficulty {
	if (sweeps <= 3) return 'easy';
	if (sweeps <= 5) return 'medium';
	return 'hard';
}

/**
 * Turn a drawn grid into a shippable puzzle, or say why not.
 * Puzzles solved within the first sweep need no cross-line reasoning at all and are
 * rejected as trivial alongside the free-line gate.
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
	if (result.sweeps <= 1 && reveals.length === 0) return { ok: false, reason: 'trivial' };

	return {
		ok: true,
		puzzle: {
			grid: clean.grid,
			rowClues,
			colClues,
			reveals,
			difficulty: gradeDifficulty(result.sweeps),
			stats: {
				sweeps: result.sweeps,
				firstSweepDetermined: result.firstSweepDetermined,
				cellsChanged: clean.cellsChanged
			}
		}
	};
}
