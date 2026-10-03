/**
 * Nonogram core logic — clues, an exact line solver and constraint propagation.
 *
 * Pure and dependency-free, so it is safe on the client (gutter dimming, hints) and
 * on the server (puzzle generation). See NONOGRAMS_PLAN.md §4 for why propagation —
 * not a solution count — is the accept test.
 */

/** A solution grid: rows of cells, 1 = filled, 0 = empty. */
export type Grid = number[][];
/** Run lengths of filled cells along one line, in order. An empty line is `[]`. */
export type Clue = number[];

/** What is known about a cell while solving. */
export const UNKNOWN = 0;
export const FILLED = 1;
export const EMPTY = 2;
export type CellState = typeof UNKNOWN | typeof FILLED | typeof EMPTY;

// ─── Clues ───────────────────────────────────────────────────────────────────

/** Ordered lengths of the maximal runs of filled cells in a line. */
export function cluesOf(line: readonly number[]): Clue {
	const out: Clue = [];
	let run = 0;
	for (const cell of line) {
		if (cell === 1) run++;
		else if (run) {
			out.push(run);
			run = 0;
		}
	}
	if (run) out.push(run);
	return out;
}

export function computeClues(grid: Grid): { rowClues: Clue[]; colClues: Clue[] } {
	const h = grid.length;
	const w = h ? grid[0].length : 0;
	const rowClues = grid.map(cluesOf);
	const colClues: Clue[] = [];
	for (let x = 0; x < w; x++) colClues.push(cluesOf(grid.map((row) => row[x])));
	return { rowClues, colClues };
}

// ─── Line solver ─────────────────────────────────────────────────────────────

export type LineResult = { ok: true; line: CellState[] } | { ok: false };

/**
 * Exact line solver: given what is known about a line and its clue, return the line
 * with every cell that is the same in **all** valid completions filled in — or
 * `{ ok: false }` if no completion exists.
 *
 * It never guesses: a cell is written only when no valid completion disagrees. That is
 * what makes propagation sound (§4): every value it writes holds in every solution.
 *
 * Forward/backward reachability over states (position i, blocks placed j), O(n·k)
 * states. From (i, j) a solution either leaves cell i empty → (i+1, j), or starts
 * block j at i, which needs clue[j] fillable cells then an empty separator (or the end
 * of the line). A transition is usable iff its source is reachable from the start and
 * its target can still reach the end; usable transitions say which values each cell
 * can take.
 */
export function solveLine(line: readonly CellState[], clue: readonly number[]): LineResult {
	const n = line.length;
	const k = clue.length;
	for (const c of clue) {
		if (!Number.isInteger(c) || c < 1) throw new Error(`invalid clue value: ${c}`);
	}

	// emptyBefore[i] = number of known-EMPTY cells in [0, i) → O(1) "can these all be filled?"
	const emptyBefore = new Array<number>(n + 1);
	emptyBefore[0] = 0;
	for (let i = 0; i < n; i++) emptyBefore[i + 1] = emptyBefore[i] + (line[i] === EMPTY ? 1 : 0);
	const canFillRange = (from: number, len: number) => emptyBefore[from + len] === emptyBefore[from];
	const canBeEmpty = (i: number) => line[i] !== FILLED;

	const W = k + 1;
	const at = (i: number, j: number) => i * W + j;

	// fw: (i, j) reachable from (0, 0).
	const fw = new Uint8Array((n + 1) * W);
	fw[at(0, 0)] = 1;
	for (let i = 0; i <= n; i++) {
		for (let j = 0; j <= k; j++) {
			if (!fw[at(i, j)]) continue;
			if (i < n && canBeEmpty(i)) fw[at(i + 1, j)] = 1;
			if (j < k) {
				const end = i + clue[j];
				if (end <= n && canFillRange(i, clue[j])) {
					if (end === n) fw[at(n, j + 1)] = 1;
					else if (canBeEmpty(end)) fw[at(end + 1, j + 1)] = 1;
				}
			}
		}
	}
	if (!fw[at(n, k)]) return { ok: false };

	// bw: (n, k) reachable from (i, j). Every transition moves to a larger i.
	const bw = new Uint8Array((n + 1) * W);
	bw[at(n, k)] = 1;
	for (let i = n; i >= 0; i--) {
		for (let j = k; j >= 0; j--) {
			if (i === n && j === k) continue;
			if (i < n && canBeEmpty(i) && bw[at(i + 1, j)]) {
				bw[at(i, j)] = 1;
				continue;
			}
			if (j < k) {
				const end = i + clue[j];
				if (end <= n && canFillRange(i, clue[j])) {
					if (end === n ? bw[at(n, j + 1)] : canBeEmpty(end) && bw[at(end + 1, j + 1)]) {
						bw[at(i, j)] = 1;
					}
				}
			}
		}
	}

	const canFill = new Uint8Array(n);
	const canEmpty = new Uint8Array(n);
	for (let i = 0; i <= n; i++) {
		for (let j = 0; j <= k; j++) {
			if (!fw[at(i, j)]) continue;
			if (i < n && canBeEmpty(i) && bw[at(i + 1, j)]) canEmpty[i] = 1;
			if (j < k) {
				const end = i + clue[j];
				if (end > n || !canFillRange(i, clue[j])) continue;
				const usable = end === n ? bw[at(n, j + 1)] : canBeEmpty(end) && bw[at(end + 1, j + 1)];
				if (!usable) continue;
				for (let x = i; x < end; x++) canFill[x] = 1;
				if (end < n) canEmpty[end] = 1; // the separator
			}
		}
	}

	const out = line.slice() as CellState[];
	for (let x = 0; x < n; x++) {
		if (canFill[x] && !canEmpty[x]) out[x] = FILLED;
		else if (canEmpty[x] && !canFill[x]) out[x] = EMPTY;
		// Unreachable when a completion exists: every completion assigns every cell.
		else if (!canFill[x] && !canEmpty[x]) return { ok: false };
	}
	return { ok: true, line: out };
}

// ─── Propagation ─────────────────────────────────────────────────────────────

export interface PropagationResult {
	/** solved = every cell determined; stalled = needs a guess; contradiction = no solution. */
	status: 'solved' | 'stalled' | 'contradiction';
	state: CellState[][];
	/** Sweeps over the dirty lines until nothing changed — a cheap difficulty signal. */
	sweeps: number;
	/** Cells determined after the first sweep (no cross-line reasoning yet). */
	firstSweepDetermined: number;
}

/**
 * Run the line solver over every row and column until a fixpoint.
 *
 * If this determines every cell without contradiction, the puzzle has exactly one
 * solution (NONOGRAMS_PLAN.md §4): each write holds in every solution, so a total
 * assignment is the only one. Propagation is monotone (cells only go UNKNOWN →
 * known), so it terminates and its outcome does not depend on line order.
 */
export function propagate(
	rowClues: readonly Clue[],
	colClues: readonly Clue[],
	initial?: readonly (readonly CellState[])[]
): PropagationResult {
	const h = rowClues.length;
	const w = colClues.length;
	const state: CellState[][] = Array.from({ length: h }, (_, y) =>
		Array.from({ length: w }, (_, x) => (initial ? initial[y][x] : UNKNOWN))
	);

	const rowDirty = new Array<boolean>(h).fill(true);
	const colDirty = new Array<boolean>(w).fill(true);
	let sweeps = 0;
	let firstSweepDetermined = 0;

	while (rowDirty.includes(true) || colDirty.includes(true)) {
		sweeps++;
		for (let y = 0; y < h; y++) {
			if (!rowDirty[y]) continue;
			rowDirty[y] = false;
			const res = solveLine(state[y], rowClues[y]);
			if (!res.ok) return { status: 'contradiction', state, sweeps, firstSweepDetermined };
			for (let x = 0; x < w; x++) {
				if (res.line[x] !== state[y][x]) {
					state[y][x] = res.line[x];
					colDirty[x] = true;
				}
			}
		}
		for (let x = 0; x < w; x++) {
			if (!colDirty[x]) continue;
			colDirty[x] = false;
			const col = state.map((row) => row[x]);
			const res = solveLine(col, colClues[x]);
			if (!res.ok) return { status: 'contradiction', state, sweeps, firstSweepDetermined };
			for (let y = 0; y < h; y++) {
				if (res.line[y] !== state[y][x]) {
					state[y][x] = res.line[y];
					rowDirty[y] = true;
				}
			}
		}
		if (sweeps === 1) firstSweepDetermined = countDetermined(state);
	}

	const solved = state.every((row) => row.every((c) => c !== UNKNOWN));
	return { status: solved ? 'solved' : 'stalled', state, sweeps, firstSweepDetermined };
}

function countDetermined(state: readonly (readonly CellState[])[]): number {
	let n = 0;
	for (const row of state) for (const c of row) if (c !== UNKNOWN) n++;
	return n;
}

/** Does the player's line satisfy its clue exactly? Drives gutter dimming in the UI. */
export function lineSatisfies(filled: readonly boolean[], clue: readonly number[]): boolean {
	const runs = cluesOf(filled.map((f) => (f ? 1 : 0)));
	return runs.length === clue.length && runs.every((r, i) => r === clue[i]);
}
