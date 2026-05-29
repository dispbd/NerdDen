/** Shared Sudoku types and utilities safe to use in both browser and server code. */

export type Grid = number[][];
export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme';

/** Supported grid sizes */
export type GridSize = 4 | 6 | 9;

/** A save slot usable in both DB (auth) and localStorage (guest) contexts. */
export interface SaveSlot {
	id: string;
	/** 'db' — stored in PostgreSQL; 'local' — stored in localStorage */
	source: 'db' | 'local';
	difficulty: Difficulty;
	gridSize: GridSize;
	/** Original puzzle with 0s for empty cells. Undefined for saves created before this field was added. */
	puzzle?: Grid;
	gridState: Grid;
	solution: Grid;
	/** Elapsed time in seconds */
	timeSpent: number;
	/** ISO date string */
	createdAt: string;
}

/** Box dimensions per grid size */
export interface BoxDim {
	rows: number;
	cols: number;
}

const BOX_DIMS: Record<GridSize, BoxDim> = {
	4: { rows: 2, cols: 2 },
	6: { rows: 2, cols: 3 },
	9: { rows: 3, cols: 3 }
};

/** Get box dimensions for a given grid size */
export function getBoxDim(gridSize: GridSize): BoxDim {
	return BOX_DIMS[gridSize];
}
