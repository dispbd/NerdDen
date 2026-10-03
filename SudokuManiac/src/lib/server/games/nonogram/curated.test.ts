import { describe, expect, it } from 'vitest';
import { computeClues } from '$lib/games/nonogram/solver';
import { NONOGRAM_SIZES } from '$lib/games/nonogram/types';
import { CURATED, rowsToGrid } from './curated';
import { depthOf, gradeDifficulty, repairWithReveals } from './pipeline';

/** Reveals a curated picture may lean on — same cap the AI path uses. */
const MAX_REVEALS = 3;

describe('curated nonogram bank', () => {
	it('has a decent set per size and unique ids', () => {
		const ids = new Set<string>();
		for (const size of NONOGRAM_SIZES) {
			expect(CURATED[size].length, `size ${size}`).toBeGreaterThanOrEqual(15);
			for (const p of CURATED[size]) {
				expect(ids.has(p.id), `duplicate id ${p.id}`).toBe(false);
				ids.add(p.id);
			}
		}
	});

	it('every picture is well-formed, solvable without guessing, and not trivial', () => {
		const problems: string[] = [];
		for (const size of NONOGRAM_SIZES) {
			for (const p of CURATED[size]) {
				const bad =
					p.rows.length !== size || p.rows.some((r) => r.length !== size || /[^#.]/.test(r));
				if (bad) {
					problems.push(`${p.id}: not a ${size}×${size} grid of '#'/'.'`);
					continue;
				}
				const grid = rowsToGrid(p.rows);
				const { rowClues, colClues } = computeClues(grid);
				const repaired = repairWithReveals(grid, rowClues, colClues, MAX_REVEALS);
				if (!repaired) {
					problems.push(`${p.id}: needs more than ${MAX_REVEALS} reveals to be uniquely solvable`);
					continue;
				}
				const depth = depthOf(grid, rowClues, colClues, repaired.reveals);
				if (size >= 10 && depth.rounds <= 1 && repaired.reveals.length === 0) {
					problems.push(`${p.id}: trivial — solved in a single round`);
				}
			}
		}
		expect(problems, problems.join('\n')).toEqual([]);
	});

	it('covers every difficulty band at every size, so a requested difficulty can be honoured', () => {
		for (const size of NONOGRAM_SIZES) {
			const tally = { easy: 0, medium: 0, hard: 0 };
			for (const p of CURATED[size]) {
				const grid = rowsToGrid(p.rows);
				const { rowClues, colClues } = computeClues(grid);
				const { reveals } = repairWithReveals(grid, rowClues, colClues, MAX_REVEALS)!;
				tally[gradeDifficulty(depthOf(grid, rowClues, colClues, reveals).rounds, size)]++;
			}
			for (const band of ['easy', 'medium', 'hard'] as const) {
				expect(
					tally[band],
					`size ${size} has too few ${band} pictures: ${JSON.stringify(tally)}`
				).toBeGreaterThanOrEqual(2);
			}
		}
	});
});
