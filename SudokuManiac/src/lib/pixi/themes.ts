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
	gridLine: number;
	gridLineThick: number; // box borders
	digitGiven: number;
	digitPlayer: number;
	digitError: number;
	digitCandidate: number;
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
