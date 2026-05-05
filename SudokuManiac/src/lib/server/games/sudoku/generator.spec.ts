import { describe, it, expect } from 'vitest';
import {
	generatePuzzle,
	cloneGrid,
	type Grid,
	type Difficulty
} from '$lib/server/games/sudoku/generator.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countEmpty(grid: Grid): number {
	return grid.flat().filter((v) => v === 0).length;
}

function isComplete(grid: Grid): boolean {
	return grid.flat().every((v) => v >= 1 && v <= 9);
}

function isValidSolution(grid: Grid): boolean {
	for (let i = 0; i < 9; i++) {
		const row = grid[i];
		const col = grid.map((r) => r[i]);
		const boxRow = Math.floor(i / 3) * 3;
		const boxCol = (i % 3) * 3;
		const box = [];
		for (let r = boxRow; r < boxRow + 3; r++) {
			for (let c = boxCol; c < boxCol + 3; c++) {
				box.push(grid[r][c]);
			}
		}
		for (const group of [row, col, box]) {
			const set = new Set(group);
			if (set.size !== 9) return false;
		}
	}
	return true;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generatePuzzle', () => {
	it('returns a puzzle and solution', () => {
		const { puzzle, solution } = generatePuzzle('beginner');
		expect(puzzle).toHaveLength(9);
		expect(solution).toHaveLength(9);
		expect(puzzle[0]).toHaveLength(9);
	});

	it('solution is a valid complete Sudoku', () => {
		const { solution } = generatePuzzle('medium');
		expect(isComplete(solution)).toBe(true);
		expect(isValidSolution(solution)).toBe(true);
	});

	it('puzzle has empty cells', () => {
		const { puzzle } = generatePuzzle('easy');
		expect(countEmpty(puzzle)).toBeGreaterThan(0);
	});

	it('puzzle cells not overriding solution values', () => {
		const { puzzle, solution } = generatePuzzle('medium');
		for (let r = 0; r < 9; r++) {
			for (let c = 0; c < 9; c++) {
				if (puzzle[r][c] !== 0) {
					expect(puzzle[r][c]).toBe(solution[r][c]);
				}
			}
		}
	});

	const difficulties: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];
	it.each(difficulties)('generates puzzle for difficulty: %s', (diff) => {
		const { puzzle, solution, difficulty } = generatePuzzle(diff);
		expect(difficulty).toBe(diff);
		expect(isValidSolution(solution)).toBe(true);
		expect(countEmpty(puzzle)).toBeGreaterThan(0);
	});

	it('harder difficulties have more empty cells than beginner', () => {
		const { puzzle: beginner } = generatePuzzle('beginner');
		const { puzzle: expert } = generatePuzzle('expert');
		expect(countEmpty(expert)).toBeGreaterThan(countEmpty(beginner));
	});
});

describe('cloneGrid', () => {
	it('creates a deep copy', () => {
		const { puzzle } = generatePuzzle('beginner');
		const clone = cloneGrid(puzzle);
		clone[0][0] = 99;
		expect(puzzle[0][0]).not.toBe(99);
	});
});
