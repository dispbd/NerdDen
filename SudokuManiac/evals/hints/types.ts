import type { Difficulty, Grid } from '../../src/lib/games/sudoku/shared.ts';
import type { Move } from './sudoku.ts';

export interface HintCase {
	id: string;
	difficulty: Difficulty;
	/** Share of the puzzle's empty cells the player has already filled (correctly). */
	stage: number;
	puzzle: Grid;
	playerGrid: Grid;
	solution: Grid;
	/** Every logical next move on playerGrid. */
	singles: Move[];
}
