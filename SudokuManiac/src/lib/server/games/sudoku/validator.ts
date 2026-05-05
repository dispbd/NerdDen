/**
 * Sudoku validator.
 * Validates rows, columns, and 3×3 boxes.
 */

import type { Grid } from './generator.js';

export interface ValidationResult {
	valid: boolean;
	/** Positions of cells that violate rules: [row, col] pairs */
	errors: [number, number][];
}

function hasDuplicates(values: number[]): number[] {
	const seen = new Set<number>();
	const duplicates = new Set<number>();
	for (const v of values) {
		if (v !== 0) {
			if (seen.has(v)) duplicates.add(v);
			seen.add(v);
		}
	}
	return [...duplicates];
}

/**
 * Validate the current state of a puzzle grid.
 * Returns which cells are in conflict (multiple same digits in row/col/box).
 */
export function validateGrid(grid: Grid): ValidationResult {
	const errorSet = new Set<string>();

	const markErrors = (positions: [number, number][]) => {
		const values = positions.map(([r, c]) => grid[r][c]);
		const dups = hasDuplicates(values);
		positions.forEach(([r, c]) => {
			if (dups.includes(grid[r][c]) && grid[r][c] !== 0) {
				errorSet.add(`${r},${c}`);
			}
		});
	};

	for (let i = 0; i < 9; i++) {
		// Row i
		markErrors(Array.from({ length: 9 }, (_, c) => [i, c]));
		// Col i
		markErrors(Array.from({ length: 9 }, (_, r) => [r, i]));
		// Box (i)
		const boxRow = Math.floor(i / 3) * 3;
		const boxCol = (i % 3) * 3;
		const boxCells: [number, number][] = [];
		for (let r = boxRow; r < boxRow + 3; r++) {
			for (let c = boxCol; c < boxCol + 3; c++) {
				boxCells.push([r, c]);
			}
		}
		markErrors(boxCells);
	}

	const errors = [...errorSet].map((s) => s.split(',').map(Number) as [number, number]);
	return { valid: errors.length === 0, errors };
}

/**
 * Check if the puzzle is fully and correctly completed
 * (no empty cells, no errors).
 */
export function isSolved(grid: Grid): boolean {
	const hasEmpty = grid.some((row) => row.includes(0));
	if (hasEmpty) return false;
	return validateGrid(grid).valid;
}

/**
 * Check if the player's grid matches the solution exactly.
 */
export function matchesSolution(grid: Grid, solution: Grid): boolean {
	for (let r = 0; r < 9; r++) {
		for (let c = 0; c < 9; c++) {
			if (grid[r][c] !== solution[r][c]) return false;
		}
	}
	return true;
}
