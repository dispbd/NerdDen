/** Shared Nonogram types + constants (safe to import on client and server). */

import type { Clue } from './solver';

/** Board sizes. Capped at 15 for legibility — clue gutters add ~50% per axis. */
export const NONOGRAM_SIZES = [5, 10, 15] as const;
export type NonogramSize = (typeof NONOGRAM_SIZES)[number];

export const NONOGRAM_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type NonogramDifficulty = (typeof NONOGRAM_DIFFICULTIES)[number];

export type NonogramSource = 'ai' | 'curated' | 'procedural';

/** Wrong fills allowed before the puzzle is lost. */
export const MAX_MISTAKES = 3;
/** Hint charges per game. */
export const HINTS_PER_GAME = 3;

/**
 * A cell revealed before play. Tri-state on purpose (NONOGRAMS_PLAN.md §4): an EMPTY
 * reveal is as load-bearing for uniqueness as a FILLED one, and renders as a locked X.
 */
export interface Reveal {
	x: number;
	y: number;
	state: 'filled' | 'empty';
}

/** What the player has put on a cell. 'marked' is a cross ("this is empty"). */
export type CellMark = 'filled' | 'marked';
/** Player marks keyed "x,y". */
export type PlayerGrid = Record<string, CellMark>;

/** One player action on a cell, as the board emits it and the moves endpoint takes it. */
export interface NonogramMove {
	x: number;
	y: number;
	action: 'fill' | 'mark' | 'clear';
}

/** A puzzle as the client sees it — clues and reveals, never the solution. */
export interface ClientNonogram {
	id: string;
	title: string;
	size: NonogramSize;
	difficulty: NonogramDifficulty;
	source: NonogramSource;
	color: string;
	rowClues: Clue[];
	colClues: Clue[];
	reveals: Reveal[];
}

/** A library card. `solution` is present only once the player has solved it. */
export interface NonogramLibraryItem {
	id: string;
	title: string;
	size: NonogramSize;
	difficulty: NonogramDifficulty;
	source: NonogramSource;
	color: string;
	status: 'new' | 'in_progress' | 'completed' | 'failed';
	/** Share of solution cells filled, 0–100 */
	progress: number;
	/** Row strings of the picture — revealed only after solving */
	solution: string[] | null;
}

export const cellKey = (x: number, y: number) => `${x},${y}`;
