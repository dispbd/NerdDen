/**
 * Visual themes for the Sudoku board.
 */

export interface BoardTheme {
	background: number;
	cellBackground: number;
	cellBackgroundAlt: number; // slightly different for 3×3 boxes
	cellSelected: number;
	cellHighlighted: number; // same row/col/box as selected
	cellError: number;
	cellGiven: number; // locked (pre-filled) cell bg
	cellOpponentSelected?: number; // opponent’s active cell (shown in read-only board)
	gridLine: number;
	gridLineThick: number; // box borders
	digitGiven: number;
	digitPlayer: number;
	digitError: number;
	digitHint?: number;       // hint-revealed digit (optional, falls back to digitPlayer)
	digitCandidate: number;
	fontFamily?: string;      // custom font (default: system-ui)
	digitScale?: number;      // fontSize = cellSize * digitScale (default: 0.56)
	gridLineWidth?: number;   // thin cell line width (default: 1)
	gridLineThickWidth?: number; // box border width (default: 2.5)
}

export const lightTheme: BoardTheme = {
	background: 0xf5f5f5,
	cellBackground: 0xffffff,
	cellBackgroundAlt: 0xf0f4ff,
	cellSelected: 0xbbd6fb,
	cellHighlighted: 0xdaeafe,
	cellError: 0xffe0e0,
	cellGiven: 0xeceff8,
	gridLine: 0xb0b8cc,
	gridLineThick: 0x3a4560,
	digitGiven: 0x1a2340,
	digitPlayer: 0x2563eb,
	digitError: 0xdc2626,
	digitCandidate: 0x6b7280
};

/** Notebook / paper theme — mimics a hand-filled sudoku booklet */
export const notebookTheme: BoardTheme = {
	background: 0xffffff,
	cellBackground: 0xffffff,
	cellBackgroundAlt: 0xffffff, // no alternating box tint
	cellSelected: 0xd0e8ff,
	cellHighlighted: 0xf0f7ff,
	cellError: 0xffe8e8,
	cellGiven: 0xffffff,         // given cells are plain white
	cellOpponentSelected: 0xffd54f, // amber — opponent cursor
	gridLine: 0xcccccc,          // light gray thin lines
	gridLineThick: 0x0a0a0a,     // near-black box borders
	digitGiven: 0x0a0a0a,        // black
	digitPlayer: 0xbf1515,       // dark red
	digitError: 0xff2020,
	digitHint: 0x1a7a2a,         // dark green (matches photo)
	digitCandidate: 0x999999,
	fontFamily: 'Caveat, cursive',
	digitScale: 0.64,
	gridLineWidth: 0.75,
	gridLineThickWidth: 2.0
};

export const darkTheme: BoardTheme = {
	background: 0x1a1d2e,
	cellBackground: 0x22263a,
	cellBackgroundAlt: 0x1e2235,
	cellSelected: 0x1e3a5f,
	cellHighlighted: 0x1c2d4a,
	cellError: 0x4a1c1c,
	cellGiven: 0x2a2f45,
	gridLine: 0x3a4055,
	gridLineThick: 0x8899cc,
	digitGiven: 0xe8eaf6,
	digitPlayer: 0x60a5fa,
	digitError: 0xf87171,
	digitCandidate: 0x6b7a99
};
