/**
 * Sudoku puzzle generator — runs in both browser and server (no Node.js APIs).
 * Supports 4×4, 6×6, and 9×9 grids.
 * Algorithm: fill a solved board with backtracking, then remove cells
 * ensuring a unique solution remains (for higher difficulties).
 */

export type { Grid, Difficulty, GridSize, BoxDim } from './shared.js';
export { getBoxDim } from './shared.js';
import type { Grid, Difficulty, GridSize } from './shared.js';
import { getBoxDim } from './shared.js';

/**
 * Fraction of cells to remove per difficulty.
 * Applied to total cell count so it works for any grid size.
 */
const REMOVE_FRACTIONS: Record<Difficulty, number> = {
	beginner: 0.27,
	easy: 0.37,
	medium: 0.49,
	hard: 0.57,
	expert: 0.64,
	extreme: 0.72
};

/** Deep-clone a grid */
export function cloneGrid(grid: Grid): Grid {
	return grid.map((row) => [...row]);
}

/** Check whether placing `num` at (row, col) is valid in a grid of given size */
function isValid(grid: Grid, row: number, col: number, num: number, size: GridSize): boolean {
	const { rows: bRows, cols: bCols } = getBoxDim(size);

	if (grid[row].includes(num)) return false;

	for (let r = 0; r < size; r++) {
		if (grid[r][col] === num) return false;
	}

	const boxRow = Math.floor(row / bRows) * bRows;
	const boxCol = Math.floor(col / bCols) * bCols;
	for (let r = boxRow; r < boxRow + bRows; r++) {
		for (let c = boxCol; c < boxCol + bCols; c++) {
			if (grid[r][c] === num) return false;
		}
	}

	return true;
}

/** Shuffle an array in place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

/** Fill grid with a valid complete solution using backtracking */
function fillGrid(grid: Grid, size: GridSize): boolean {
	const digits = shuffle(Array.from({ length: size }, (_, i) => i + 1));

	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (grid[row][col] === 0) {
				const nums = [...digits];
				shuffle(nums);
				for (const num of nums) {
					if (isValid(grid, row, col, num, size)) {
						grid[row][col] = num;
						if (fillGrid(grid, size)) return true;
						grid[row][col] = 0;
					}
				}
				return false;
			}
		}
	}
	return true;
}

/**
 * Count solutions (stops at 2 to detect uniqueness efficiently).
 * Returns 0, 1, or 2 (meaning "2 or more").
 */
function countSolutions(grid: Grid, size: GridSize, limit = 2): number {
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (grid[row][col] === 0) {
				let count = 0;
				for (let num = 1; num <= size; num++) {
					if (isValid(grid, row, col, num, size)) {
						grid[row][col] = num;
						count += countSolutions(grid, size, limit - count);
						grid[row][col] = 0;
						if (count >= limit) return count;
					}
				}
				return count;
			}
		}
	}
	return 1;
}

/** Remove cells while keeping a unique solution */
function removeCells(grid: Grid, count: number, size: GridSize, uniqueness: boolean): void {
	const total = size * size;
	const cells = shuffle(
		Array.from({ length: total }, (_, i) => [Math.floor(i / size), i % size] as [number, number])
	);

	let removed = 0;
	for (const [row, col] of cells) {
		if (removed >= count) break;
		const backup = grid[row][col];
		grid[row][col] = 0;

		if (uniqueness) {
			const copy = cloneGrid(grid);
			if (countSolutions(copy, size) !== 1) {
				grid[row][col] = backup;
				continue;
			}
		}

		removed++;
	}
}

export interface GeneratedPuzzle {
	/** Puzzle grid with empty cells (0) */
	puzzle: Grid;
	/** Complete solution */
	solution: Grid;
	difficulty: Difficulty;
	gridSize: GridSize;
}

/**
 * Generate a Sudoku puzzle for the given difficulty and grid size.
 * Runs entirely in the browser — no network request needed.
 * For beginner/easy the uniqueness check is skipped for speed.
 */
export function generatePuzzle(difficulty: Difficulty = 'medium', gridSize: GridSize = 9): GeneratedPuzzle {
	const solution: Grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
	fillGrid(solution, gridSize);

	const puzzle = cloneGrid(solution);
	const total = gridSize * gridSize;
	const removeCount = Math.round(total * REMOVE_FRACTIONS[difficulty]);
	const checkUniqueness = difficulty !== 'beginner' && difficulty !== 'easy';

	removeCells(puzzle, removeCount, gridSize, checkUniqueness);

	return { puzzle, solution, difficulty, gridSize };
}
