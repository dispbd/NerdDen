/**
 * Server re-export — actual implementation lives in $lib/games/sudoku/generator.ts
 * so that the same code can run in the browser (offline / no network request needed).
 */
export {
	generatePuzzle,
	cloneGrid,
	getBoxDim
} from '$lib/games/sudoku/generator.js';
export type {
	Grid,
	Difficulty,
	GridSize,
	BoxDim,
	GeneratedPuzzle
} from '$lib/games/sudoku/generator.js';
