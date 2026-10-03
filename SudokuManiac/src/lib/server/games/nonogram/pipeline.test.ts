import { describe, expect, it } from 'vitest';
import {
	EMPTY,
	FILLED,
	UNKNOWN,
	computeClues,
	propagate,
	type CellState,
	type Grid
} from '$lib/games/nonogram/solver';
import {
	cleanGrid,
	componentSizes,
	despeckle,
	lineIsFree,
	prepareCandidate,
	repairWithReveals
} from './pipeline';

function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const blank = (n: number): Grid => Array.from({ length: n }, () => new Array<number>(n).fill(0));

/** A filled disc — a stand-in for picture-like art. */
function disc(n: number, cx: number, cy: number, r: number): Grid {
	return Array.from({ length: n }, (_, y) =>
		Array.from({ length: n }, (_, x) => ((x - cx) ** 2 + (y - cy) ** 2 <= r * r ? 1 : 0))
	);
}

// ─── Cleanup regressions from the design review ──────────────────────────────

describe('despeckle', () => {
	it('keeps a 1-pixel diagonal intact (the naive 4-neighbour rule erased it)', () => {
		const g = blank(10);
		for (let i = 1; i < 9; i++) g[i][i] = 1;
		const out = despeckle(g);
		expect(out.changed).toBe(0);
		expect(out.grid).toEqual(g);
	});

	it('removes a truly isolated dot and fills a truly enclosed pinhole', () => {
		const g = blank(10);
		g[1][1] = 1; // isolated dot
		for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) g[y][x] = 1;
		g[5][5] = 0; // pinhole inside a solid 3×3
		const out = despeckle(g);
		expect(out.grid[1][1]).toBe(0);
		expect(out.grid[5][5]).toBe(1);
		expect(out.changed).toBe(2);
	});

	it('never fills an empty border cell', () => {
		const g = Array.from({ length: 10 }, () => new Array<number>(10).fill(1));
		g[0][3] = 0;
		expect(despeckle(g).grid[0][3]).toBe(0);
	});
});

describe('componentSizes', () => {
	it('treats a diagonal stroke as a single component (8-connectivity)', () => {
		const g = blank(6);
		for (let i = 0; i < 6; i++) g[i][i] = 1;
		expect(componentSizes(g).sizes).toEqual([6]);
	});
});

describe('cleanGrid', () => {
	it('drops crumbs below the size threshold and counts what it changed', () => {
		const g = disc(10, 5, 5, 3);
		g[0][9] = 1;
		g[1][9] = 1; // a 2-cell crumb: below the 3-cell minimum at 10×10
		const out = cleanGrid(g);
		expect(out.grid[0][9]).toBe(0);
		expect(out.grid[1][9]).toBe(0);
		expect(out.componentsDropped).toBe(1);
		expect(out.cellsChanged).toBeGreaterThanOrEqual(2);
	});

	it('keeps a 2-cell feature on small grids, where it can be an eye', () => {
		const g = disc(7, 3, 3, 2);
		g[0][0] = 1;
		g[0][1] = 1;
		g[0][2] = 0; // ensure the pair is its own component
		const out = cleanGrid(g);
		expect(out.grid[0][0]).toBe(1);
	});
});

describe('lineIsFree', () => {
	it('counts an all-empty line as free (the k === 0 off-by-one)', () => {
		expect(lineIsFree([], 10)).toBe(true);
	});
	it('counts lines the clue fixes completely', () => {
		expect(lineIsFree([5], 5)).toBe(true);
		expect(lineIsFree([2, 2], 5)).toBe(true);
	});
	it('does not count lines that need deduction', () => {
		expect(lineIsFree([1], 5)).toBe(false);
		expect(lineIsFree([2, 1], 6)).toBe(false);
	});
});

// ─── Repair: reveals must be tri-state ───────────────────────────────────────

describe('repairWithReveals', () => {
	/** Stalled grids from a fixed seed, so the assertions below are deterministic. */
	function stalledSamples() {
		const rand = rng(11);
		const out: { grid: Grid; rowClues: number[][]; colClues: number[][] }[] = [];
		while (out.length < 60) {
			const g = Array.from({ length: 8 }, () =>
				Array.from({ length: 8 }, () => (rand() < 0.5 ? 1 : 0))
			);
			const { rowClues, colClues } = computeClues(g);
			if (propagate(rowClues, colClues).status === 'stalled')
				out.push({ grid: g, rowClues, colClues });
		}
		return out;
	}

	it('turns every stalled puzzle into a uniquely solvable one whose reveals match the picture', () => {
		for (const { grid, rowClues, colClues } of stalledSamples()) {
			const repaired = repairWithReveals(grid, rowClues, colClues, 64);
			expect(repaired).not.toBeNull();
			const { reveals, result } = repaired!;
			expect(result.status).toBe('solved');
			result.state.forEach((row, y) =>
				row.forEach((c, x) => expect(c === FILLED ? 1 : 0).toBe(grid[y][x]))
			);
			for (const r of reveals) expect(r.state === 'filled' ? 1 : 0).toBe(grid[r.y][r.x]);
		}
	});

	it('reveals EMPTY cells too — and those are load-bearing', () => {
		let emptyReveals = 0;
		let brokenWithoutThem = 0;
		for (const { grid, rowClues, colClues } of stalledSamples()) {
			const { reveals } = repairWithReveals(grid, rowClues, colClues, 64)!;
			const empties = reveals.filter((r) => r.state === 'empty');
			emptyReveals += empties.length;
			if (!empties.length) continue;
			// Persist only the filled reveals, as a "prefilled cells" set would.
			const initial: CellState[][] = grid.map((row) => row.map(() => UNKNOWN));
			for (const r of reveals) if (r.state === 'filled') initial[r.y][r.x] = FILLED;
			if (propagate(rowClues, colClues, initial).status !== 'solved') brokenWithoutThem++;
		}
		expect(emptyReveals).toBeGreaterThan(0);
		// Dropping the EMPTY reveals breaks uniqueness for real puzzles, not hypothetically.
		expect(brokenWithoutThem).toBeGreaterThan(0);
	});

	it('gives up when the reveal budget is exhausted', () => {
		const [{ grid, rowClues, colClues }] = stalledSamples();
		expect(repairWithReveals(grid, rowClues, colClues, 0)).toBeNull();
	});

	it('marks a revealed EMPTY cell as known empty in the initial state', () => {
		const { rowClues, colClues } = computeClues([
			[1, 0],
			[0, 1]
		]);
		const res = propagate(rowClues, colClues, [
			[UNKNOWN, EMPTY],
			[UNKNOWN, UNKNOWN]
		]);
		expect(res.status).toBe('solved');
	});
});

// ─── The whole candidate pipeline ────────────────────────────────────────────

describe('prepareCandidate', () => {
	it('gates and computes clues on the cleaned grid — the one that ships', () => {
		const g = disc(10, 4.5, 4.5, 3.6);
		g[0][0] = 1; // isolated speck, removed by cleanup
		const res = prepareCandidate(g);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.puzzle.grid[0][0]).toBe(0);
		expect({ rowClues: res.puzzle.rowClues, colClues: res.puzzle.colClues }).toEqual(
			computeClues(res.puzzle.grid)
		);
	});

	it('ships puzzles that propagation solves from clues + reveals alone', () => {
		const rand = rng(23);
		let accepted = 0;
		for (let t = 0; t < 80; t++) {
			const cx = 3 + rand() * 4;
			const cy = 3 + rand() * 4;
			const g = disc(10, cx, cy, 2.5 + rand() * 2);
			// add a second blob so the shape is not a plain disc
			const g2 = disc(10, 10 - cx, 10 - cy, 1.5 + rand() * 1.5);
			const grid = g.map((row, y) => row.map((v, x) => v | g2[y][x]));
			const res = prepareCandidate(grid);
			if (!res.ok) continue;
			accepted++;
			const initial: CellState[][] = res.puzzle.grid.map((row) => row.map(() => UNKNOWN));
			for (const r of res.puzzle.reveals) initial[r.y][r.x] = r.state === 'filled' ? FILLED : EMPTY;
			const check = propagate(res.puzzle.rowClues, res.puzzle.colClues, initial);
			expect(check.status).toBe('solved');
		}
		expect(accepted).toBeGreaterThan(0);
	});

	it('rejects non-square, blank and over-cleaned grids with a reason', () => {
		expect(prepareCandidate([[1, 0]])).toEqual({ ok: false, reason: 'not_square' });
		expect(prepareCandidate(blank(10))).toEqual({ ok: false, reason: 'empty_or_full' });
		// Confetti: lots of isolated dots — cleanup would erase most of the "picture".
		const confetti = blank(10);
		for (let y = 0; y < 10; y += 2) for (let x = 0; x < 10; x += 2) confetti[y][x] = 1;
		const res = prepareCandidate(confetti);
		expect(res.ok).toBe(false);
	});
});
