import { describe, expect, it } from 'vitest';
import {
	EMPTY,
	FILLED,
	UNKNOWN,
	cluesOf,
	computeClues,
	lineSatisfies,
	propagate,
	solveDepth,
	solveLine,
	type CellState,
	type Grid
} from './solver';

// ─── Test helpers — deliberately independent of the code under test ──────────

/** Deterministic PRNG so failures reproduce. */
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

/** Run lengths, re-implemented here so the oracle does not lean on cluesOf. */
function runsOf(bits: readonly number[]): number[] {
	const out: number[] = [];
	let run = 0;
	for (const b of bits) {
		if (b) run++;
		else if (run) {
			out.push(run);
			run = 0;
		}
	}
	if (run) out.push(run);
	return out;
}
const sameRuns = (a: readonly number[], b: readonly number[]) =>
	a.length === b.length && a.every((v, i) => v === b[i]);

/** Brute-force line oracle: enumerate all 2^n assignments. The ground truth for solveLine. */
function oracle(
	line: readonly CellState[],
	clue: readonly number[]
): { ok: false } | { ok: true; line: CellState[] } {
	const n = line.length;
	const sawFill = new Array<boolean>(n).fill(false);
	const sawEmpty = new Array<boolean>(n).fill(false);
	let any = false;
	for (let m = 0; m < 1 << n; m++) {
		const bits = Array.from({ length: n }, (_, i) => (m >> i) & 1);
		if (bits.some((b, i) => (line[i] === FILLED && !b) || (line[i] === EMPTY && b))) continue;
		if (!sameRuns(runsOf(bits), clue)) continue;
		any = true;
		bits.forEach((b, i) => (b ? (sawFill[i] = true) : (sawEmpty[i] = true)));
	}
	if (!any) return { ok: false };
	return {
		ok: true,
		line: line.map((_, i) =>
			sawFill[i] && !sawEmpty[i] ? FILLED : sawEmpty[i] && !sawFill[i] ? EMPTY : UNKNOWN
		)
	};
}

/**
 * Independent solution counter — row-by-row backtracking with column-prefix pruning.
 * It never calls solveLine or propagate, so it can actually check them (the original
 * design's "independent" counter called propagate first, which proved nothing).
 */
function countSolutions(rowClues: number[][], colClues: number[][], limit = 2): number {
	const h = rowClues.length;
	const w = colClues.length;
	const all = Array.from({ length: 1 << w }, (_, m) =>
		Array.from({ length: w }, (_, i) => (m >> i) & 1)
	);
	const candidates = rowClues.map((c) => all.filter((l) => sameRuns(runsOf(l), c)));
	const cols: number[][] = Array.from({ length: w }, () => []);
	let count = 0;

	const fits = (prefix: number[], clue: number[]): boolean => {
		const runs: number[] = [];
		let open = 0;
		for (const c of prefix) {
			if (c) open++;
			else if (open) {
				runs.push(open);
				open = 0;
			}
		}
		if (runs.some((r, i) => r !== clue[i])) return false;
		const next = runs.length;
		if (open && (next >= clue.length || open > clue[next])) return false;
		if (prefix.length === h) return sameRuns(open ? [...runs, open] : runs, clue);
		const rest = clue.slice(open ? next + 1 : next);
		const restNeed = rest.reduce((a, b) => a + b, 0) + rest.length;
		const need = open ? clue[next] - open + restNeed : Math.max(0, restNeed - 1);
		return need <= h - prefix.length;
	};

	const rec = (y: number) => {
		if (count >= limit) return;
		if (y === h) {
			count++;
			return;
		}
		for (const row of candidates[y]) {
			row.forEach((v, x) => cols[x].push(v));
			if (cols.every((c, x) => fits(c, colClues[x]))) rec(y + 1);
			cols.forEach((c) => c.pop());
			if (count >= limit) return;
		}
	};
	rec(0);
	return count;
}

function randomGrid(rand: () => number, n: number, density: number): Grid {
	return Array.from({ length: n }, () =>
		Array.from({ length: n }, () => (rand() < density ? 1 : 0))
	);
}

// ─── Clues ───────────────────────────────────────────────────────────────────

describe('cluesOf', () => {
	it.each([
		[[0, 0, 0], []],
		[[1, 1, 1], [3]],
		[
			[1, 0, 1, 1, 0, 0, 1],
			[1, 2, 1]
		],
		[[0, 1, 1, 0], [2]]
	])('%j → %j', (line, clue) => expect(cluesOf(line)).toEqual(clue));

	it('computes row and column clues', () => {
		const { rowClues, colClues } = computeClues([
			[1, 1, 0],
			[0, 1, 0],
			[1, 1, 1]
		]);
		expect(rowClues).toEqual([[2], [1], [3]]);
		expect(colClues).toEqual([[1, 1], [3], [1]]);
	});
});

// ─── Line solver vs brute force ──────────────────────────────────────────────

describe('solveLine', () => {
	it('matches the brute-force oracle exactly — no over-forcing, no missed forcing', () => {
		const rand = rng(1);
		let unsat = 0;
		for (let t = 0; t < 1500; t++) {
			const n = 1 + Math.floor(rand() * 12);
			const truth = Array.from({ length: n }, () => (rand() < 0.5 ? 1 : 0));
			const clue = runsOf(truth);
			const line: CellState[] = truth.map((b) =>
				rand() < 0.3 ? (b ? FILLED : EMPTY) : UNKNOWN
			) as CellState[];
			// Sometimes corrupt a known cell so unsatisfiable lines are covered too.
			if (rand() < 0.25) {
				const i = Math.floor(rand() * n);
				line[i] = line[i] === FILLED ? EMPTY : FILLED;
			}
			const expected = oracle(line, clue);
			const actual = solveLine(line, clue);
			if (!expected.ok) unsat++;
			expect(actual, `n=${n} clue=${JSON.stringify(clue)} line=${JSON.stringify(line)}`).toEqual(
				expected
			);
		}
		expect(unsat).toBeGreaterThan(0); // the unsatisfiable branch was actually exercised
	});

	it('handles an empty clue and a full line', () => {
		expect(solveLine([UNKNOWN, UNKNOWN, UNKNOWN], [])).toEqual({
			ok: true,
			line: [EMPTY, EMPTY, EMPTY]
		});
		expect(solveLine([UNKNOWN, UNKNOWN, UNKNOWN], [3])).toEqual({
			ok: true,
			line: [FILLED, FILLED, FILLED]
		});
		expect(solveLine([FILLED, UNKNOWN, UNKNOWN], [])).toEqual({ ok: false });
	});

	it('rejects malformed clue values', () => {
		expect(() => solveLine([UNKNOWN], [0])).toThrow();
	});
});

// ─── Propagation: soundness and the uniqueness claim ────────────────────────

describe('propagate', () => {
	it('never writes a wrong value, and "solved" always means exactly one solution', () => {
		const rand = rng(7);
		let solved = 0;
		let stalled = 0;
		let multi = 0;
		for (let t = 0; t < 400; t++) {
			const n = 5 + Math.floor(rand() * 3); // 5..7
			const grid = randomGrid(rand, n, 0.4 + rand() * 0.3);
			const { rowClues, colClues } = computeClues(grid);
			const res = propagate(rowClues, colClues);
			const label = JSON.stringify(grid);

			expect(res.status, label).not.toBe('contradiction'); // the source grid is a solution
			// Soundness: every determined cell agrees with the source (a known solution).
			res.state.forEach((row, y) =>
				row.forEach((c, x) => {
					if (c !== UNKNOWN) expect(c === FILLED ? 1 : 0, label).toBe(grid[y][x]);
				})
			);

			const count = countSolutions(rowClues, colClues);
			if (res.status === 'solved') {
				solved++;
				expect(count, `propagation solved but the counter found more — ${label}`).toBe(1);
			} else {
				stalled++;
				if (count > 1) multi++;
			}
		}
		// Both outcomes occurred, so neither branch of the claim was checked vacuously.
		expect(solved).toBeGreaterThan(20);
		expect(stalled).toBeGreaterThan(20);
		expect(multi).toBeGreaterThan(0);
	});

	it('stalls on the classic 2×2 swap ambiguity', () => {
		const { rowClues, colClues } = computeClues([
			[1, 0],
			[0, 1]
		]);
		expect(propagate(rowClues, colClues).status).toBe('stalled');
		expect(countSolutions(rowClues, colClues)).toBe(2);
	});

	it('honours initial knowledge and reports a contradiction', () => {
		const { rowClues, colClues } = computeClues([
			[1, 0],
			[0, 1]
		]);
		const solvedWithHint = propagate(rowClues, colClues, [
			[FILLED, UNKNOWN],
			[UNKNOWN, UNKNOWN]
		]);
		expect(solvedWithHint.status).toBe('solved');
		const bad = propagate(rowClues, colClues, [
			[FILLED, FILLED],
			[UNKNOWN, UNKNOWN]
		]);
		expect(bad.status).toBe('contradiction');
	});
});

describe('lineSatisfies', () => {
	it('matches only the exact run list', () => {
		expect(lineSatisfies([true, true, false, true], [2, 1])).toBe(true);
		expect(lineSatisfies([true, true, true, false], [2, 1])).toBe(false);
		expect(lineSatisfies([false, false], [])).toBe(true);
	});
});

describe('solveDepth', () => {
	it('reaches the same fixpoint as propagate', () => {
		const rand = rng(31);
		for (let t = 0; t < 200; t++) {
			const n = 5 + Math.floor(rand() * 6);
			const { rowClues, colClues } = computeClues(randomGrid(rand, n, 0.5));
			expect(solveDepth(rowClues, colClues).state).toEqual(propagate(rowClues, colClues).state);
		}
	});

	it('needs one round when every line is fixed by its own clue', () => {
		const { rowClues, colClues } = computeClues([
			[1, 1, 1],
			[0, 0, 0],
			[1, 1, 1]
		]);
		const d = solveDepth(rowClues, colClues);
		expect(d.rounds).toBe(1);
		expect(d.firstRoundCoverage).toBe(1);
	});

	it('counts multi-round chains on puzzles propagation can solve', () => {
		const rand = rng(41);
		let solved = 0;
		let deepest = 0;
		for (let t = 0; t < 300; t++) {
			const { rowClues, colClues } = computeClues(randomGrid(rand, 8, 0.55));
			if (propagate(rowClues, colClues).status !== 'solved') continue;
			solved++;
			const { rounds } = solveDepth(rowClues, colClues);
			expect(rounds).toBeGreaterThanOrEqual(1);
			deepest = Math.max(deepest, rounds);
		}
		expect(solved).toBeGreaterThan(10);
		expect(deepest).toBeGreaterThanOrEqual(3);
	});
});
