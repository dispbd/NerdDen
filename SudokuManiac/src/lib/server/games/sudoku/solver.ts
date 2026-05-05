/**
 * Sudoku solver using constraint propagation + backtracking.
 * Returns the solved grid or null if no solution exists.
 */

import { cloneGrid } from './generator.js';
import type { Grid } from './generator.js';

function isValid(grid: Grid, row: number, col: number, num: number): boolean {
	if (grid[row].includes(num)) return false;
	for (let r = 0; r < 9; r++) {
		if (grid[r][col] === num) return false;
	}
	const boxRow = Math.floor(row / 3) * 3;
	const boxCol = Math.floor(col / 3) * 3;
	for (let r = boxRow; r < boxRow + 3; r++) {
		for (let c = boxCol; c < boxCol + 3; c++) {
			if (grid[r][c] === num) return false;
		}
	}
	return true;
}

/** Find the empty cell with the fewest candidates (MRV heuristic) */
function findBestCell(grid: Grid): [number, number, number[]] | null {
	let best: [number, number, number[]] | null = null;

	for (let r = 0; r < 9; r++) {
		for (let c = 0; c < 9; c++) {
			if (grid[r][c] === 0) {
				const candidates = [];
				for (let n = 1; n <= 9; n++) {
					if (isValid(grid, r, c, n)) candidates.push(n);
				}
				if (candidates.length === 0) return null; // dead end
				if (best === null || candidates.length < best[2].length) {
					best = [r, c, candidates];
				}
			}
		}
	}

	return best;
}

function solveBacktrack(grid: Grid): boolean {
	const cell = findBestCell(grid);
	if (cell === null) {
		// Check if board is complete
		return !grid.some((row) => row.includes(0));
	}

	const [row, col, candidates] = cell;
	for (const num of candidates) {
		grid[row][col] = num;
		if (solveBacktrack(grid)) return true;
		grid[row][col] = 0;
	}
	return false;
}

/**
 * Solve a puzzle and return the solution grid, or null if unsolvable.
 * Does not mutate the input grid.
 */
export function solve(puzzle: Grid): Grid | null {
	const grid = cloneGrid(puzzle);
	if (solveBacktrack(grid)) return grid;
	return null;
}

/**
 * Check whether a puzzle has exactly one solution.
 */
export function hasUniqueSolution(puzzle: Grid): boolean {
	let count = 0;

	function backtrack(grid: Grid): void {
		if (count > 1) return;
		const cell = findBestCell(grid);
		if (cell === null) {
			if (!grid.some((row) => row.includes(0))) count++;
			return;
		}
		const [row, col, candidates] = cell;
		for (const num of candidates) {
			if (count > 1) return;
			grid[row][col] = num;
			backtrack(grid);
			grid[row][col] = 0;
		}
	}

	backtrack(cloneGrid(puzzle));
	return count === 1;
}
