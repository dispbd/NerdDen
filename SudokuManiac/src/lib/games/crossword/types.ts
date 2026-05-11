/**
 * Shared crossword types — safe to import in both browser and server code.
 */

export type Direction = 'across' | 'down';

export interface CrosswordClue {
	/** Sequential clue number (1, 2, 3, …) assigned top-left → bottom-right */
	number: number;
	direction: Direction;
	/** Display clue text */
	clue: string;
	/** Correct answer (uppercase) */
	answer: string;
	/** Top-left cell of the word */
	row: number;
	col: number;
	/** Answer length */
	length: number;
}

/**
 * Grid cell values:
 *  '#'   = black (blocked) cell
 *  letter = correct answer letter (A-Z)
 */
export type CellValue = '#' | string;

/** 2-D grid: grid[row][col] */
export type CrosswordGrid = CellValue[][];

export interface Crossword {
	id: string;
	title: string;
	topic: string;
	language: string;
	difficulty: string;
	width: number;
	height: number;
	grid: CrosswordGrid;
	clues: CrosswordClue[];
	aiGenerated: boolean;
}

/** Word entry supplied to the grid builder */
export interface WordEntry {
	word: string;
	clue: string;
}

/** Result of placing a single word */
export interface PlacedWord {
	word: string;
	clue: string;
	row: number;
	col: number;
	direction: Direction;
}
