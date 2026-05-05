/** Shared Sudoku types and utilities safe to use in both browser and server code. */

export type Grid = number[][];
export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme';

/** Supported grid sizes */
export type GridSize = 4 | 6 | 9;

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
