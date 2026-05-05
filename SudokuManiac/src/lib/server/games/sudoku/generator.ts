/**
 * Sudoku puzzle generator.
 * Algorithm: fill a solved board with backtracking, then remove cells
 * ensuring a unique solution remains (for higher difficulties).
 */

export type Grid = number[][]; // 9x9, 0 = empty

export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme';

/** Number of cells to remove per difficulty */
const REMOVE_COUNTS: Record<Difficulty, number> = {
	beginner: 20,
	easy: 30,
	medium: 40,
	hard: 46,
	expert: 52,
	extreme: 58
};

/** Create an empty 9x9 grid */
function emptyGrid(): Grid {
	return Array.from({ length: 9 }, () => Array(9).fill(0));
}

/** Deep-clone a grid */
export function cloneGrid(grid: Grid): Grid {
	return grid.map((row) => [...row]);
}

/** Check whether placing `num` at (row, col) is valid */
function isValid(grid: Grid, row: number, col: number, num: number): boolean {
	// Row
	if (grid[row].includes(num)) return false;

	// Column
	for (let r = 0; r < 9; r++) {
		if (grid[r][col] === num) return false;
	}

	// 3×3 box
	const boxRow = Math.floor(row / 3) * 3;
	const boxCol = Math.floor(col / 3) * 3;
	for (let r = boxRow; r < boxRow + 3; r++) {
		for (let c = boxCol; c < boxCol + 3; c++) {
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
function fillGrid(grid: Grid): boolean {
	for (let row = 0; row < 9; row++) {
		for (let col = 0; col < 9; col++) {
			if (grid[row][col] === 0) {
				const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
				for (const num of nums) {
					if (isValid(grid, row, col, num)) {
						grid[row][col] = num;
						if (fillGrid(grid)) return true;
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
function countSolutions(grid: Grid, limit = 2): number {
	for (let row = 0; row < 9; row++) {
		for (let col = 0; col < 9; col++) {
			if (grid[row][col] === 0) {
				let count = 0;
				for (let num = 1; num <= 9; num++) {
					if (isValid(grid, row, col, num)) {
						grid[row][col] = num;
						count += countSolutions(grid, limit - count);
						grid[row][col] = 0;
						if (count >= limit) return count;
					}
				}
				return count;
			}
		}
	}
	return 1; // All cells filled → one solution found
}

/** Remove `count` cells while keeping a unique solution */
function removeCells(grid: Grid, count: number, uniqueness: boolean): void {
	const cells = shuffle(
		Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9] as [number, number])
	);

	let removed = 0;
	for (const [row, col] of cells) {
		if (removed >= count) break;
		const backup = grid[row][col];
		grid[row][col] = 0;

		if (uniqueness) {
			const copy = cloneGrid(grid);
			if (countSolutions(copy) !== 1) {
				grid[row][col] = backup; // restore — no unique solution
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
}

/**
 * Generate a Sudoku puzzle for the given difficulty.
 * For beginner/easy the uniqueness check is skipped for speed.
 */
export function generatePuzzle(difficulty: Difficulty = 'medium'): GeneratedPuzzle {
	const solution = emptyGrid();
	fillGrid(solution);

	const puzzle = cloneGrid(solution);
	const removeCount = REMOVE_COUNTS[difficulty];
	const checkUniqueness = difficulty !== 'beginner' && difficulty !== 'easy';

	removeCells(puzzle, removeCount, checkUniqueness);

	return { puzzle, solution, difficulty };
}
