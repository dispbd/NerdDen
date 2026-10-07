import { describe, expect, it } from 'vitest';
import { normalizeDrawing } from '$lib/server/ai/nonogram';
import {
	EMPTY,
	FILLED,
	UNKNOWN,
	computeClues,
	propagate,
	type CellState
} from '$lib/games/nonogram/solver';
import { CURATED, rowsToGrid } from './curated';
import {
	depthOf,
	easeToDifficulty,
	gradeDifficulty,
	pickForDifficulty,
	repairWithReveals,
	type Puzzle
} from './pipeline';
import { generateProcedural } from './procedural';

/** Does propagation solve this puzzle from exactly what ships (clues + reveals)? */
function shipsSolvable(p: Puzzle): boolean {
	const initial: CellState[][] = p.grid.map((row) => row.map(() => UNKNOWN));
	for (const r of p.reveals) initial[r.y][r.x] = r.state === 'filled' ? FILLED : EMPTY;
	const res = propagate(p.rowClues, p.colClues, initial);
	return (
		res.status === 'solved' &&
		res.state.every((row, y) => row.every((c, x) => (c === FILLED ? 1 : 0) === p.grid[y][x]))
	);
}

function curatedPuzzle(id: string): Puzzle {
	const pic = [...CURATED[5], ...CURATED[10], ...CURATED[15]].find((p) => p.id === id)!;
	const grid = rowsToGrid(pic.rows);
	const { rowClues, colClues } = computeClues(grid);
	const { reveals } = repairWithReveals(grid, rowClues, colClues, 3)!;
	const depth = depthOf(grid, rowClues, colClues, reveals);
	return {
		grid,
		rowClues,
		colClues,
		reveals,
		difficulty: gradeDifficulty(depth.rounds, grid.length),
		stats: {
			depth: depth.rounds,
			firstRoundCoverage: depth.firstRoundCoverage,
			sweeps: 0,
			cellsChanged: 0
		}
	};
}

// ─── Model output normalization ──────────────────────────────────────────────

describe('normalizeDrawing', () => {
	it('accepts an exact drawing', () => {
		expect(normalizeDrawing(['#..', '.#.', '..#'], 3)).toEqual([
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1]
		]);
	});

	it('maps the alternative characters models use', () => {
		expect(normalizeDrawing(['1x0', '*-.', '█ ·'], 3)).toEqual([
			[1, 1, 0],
			[1, 0, 0],
			[1, 0, 0]
		]);
	});

	it('undoes "# . #" space-separated rows', () => {
		expect(
			normalizeDrawing(['# . # . #', '. # . # .', '# . # . #', '. . . . .', '# # # # #'], 5)
		).toEqual([
			[1, 0, 1, 0, 1],
			[0, 1, 0, 1, 0],
			[1, 0, 1, 0, 1],
			[0, 0, 0, 0, 0],
			[1, 1, 1, 1, 1]
		]);
	});

	it('pads or crops drawings that are off by up to two', () => {
		const g = normalizeDrawing(['####', '#..#', '####'], 5)!; // one column and two rows short
		expect(g).toHaveLength(5);
		expect(g.every((r) => r.length === 5)).toBe(true);
		expect(g[0]).toEqual([1, 1, 1, 1, 0]);
		expect(
			normalizeDrawing(['#####..', '#####..', '#####..', '#####..', '#####..'], 5)![0]
		).toEqual([1, 1, 1, 1, 1]);
	});

	it('rejects drawings that are badly off or contain unknown characters', () => {
		expect(normalizeDrawing(['##', '##'], 5)).toBeNull();
		expect(normalizeDrawing(['##?##', '#####', '#####', '#####', '#####'], 5)).toBeNull();
		expect(normalizeDrawing('#####', 5)).toBeNull();
	});
});

// ─── Procedural fallback ─────────────────────────────────────────────────────

describe('generateProcedural', () => {
	it('is deterministic for a seed (so a date seed gives a daily puzzle)', () => {
		expect(generateProcedural(10, 'medium', '2026-10-04')).toEqual(
			generateProcedural(10, 'medium', '2026-10-04')
		);
	});

	it('yields a puzzle that ships solvable at every size and difficulty', () => {
		for (const size of [5, 10, 15]) {
			for (const target of ['easy', 'medium', 'hard'] as const) {
				const p = generateProcedural(size, target, `seed-${size}-${target}`);
				expect(p, `${size} ${target}`).not.toBeNull();
				expect(shipsSolvable(p!), `${size} ${target}`).toBe(true);
				expect(p!.difficulty).toBe(gradeDifficulty(p!.stats.depth, size)); // label = real grade
			}
		}
	});
});

// ─── Difficulty fitting ──────────────────────────────────────────────────────

describe('easeToDifficulty', () => {
	it('eases a hard puzzle down with extra reveals and stays uniquely solvable', () => {
		const hard = curatedPuzzle('moon10');
		expect(hard.difficulty).toBe('hard');
		const easy = easeToDifficulty(hard, 'easy');
		expect(easy).not.toBeNull();
		expect(easy!.difficulty).toBe('easy');
		expect(easy!.reveals.length).toBeGreaterThan(hard.reveals.length);
		expect(shipsSolvable(easy!)).toBe(true);
		for (const r of easy!.reveals) expect(r.state === 'filled' ? 1 : 0).toBe(easy!.grid[r.y][r.x]);
	});

	it('never makes a puzzle harder', () => {
		const easy = curatedPuzzle('bell10');
		expect(easy.difficulty).toBe('easy');
		expect(easeToDifficulty(easy, 'hard')).toBeNull();
	});
});

describe('pickForDifficulty', () => {
	const easy = curatedPuzzle('bell10');
	const hard = curatedPuzzle('moon10');

	it('prefers an exact match', () => {
		expect(pickForDifficulty([easy, hard], 'hard')).toBe(hard);
	});

	it('eases a harder candidate rather than dropping the topic', () => {
		const picked = pickForDifficulty([hard], 'easy')!;
		expect(picked.difficulty).toBe('easy');
	});

	it('falls back to the hardest available, labelled with its real grade', () => {
		const picked = pickForDifficulty([easy], 'hard')!;
		expect(picked.difficulty).toBe('easy');
	});
});
