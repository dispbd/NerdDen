/**
 * Visual themes for the Sudoku board.
 */

export interface BoardTheme {
	background: number;
	cellBackground: number;
	cellBackgroundAlt: number; // slightly different for 3×3 boxes
	cellSelected: number;
	cellHighlighted: number; // same row/col/box as selected
	cellSameDigit?: number; // cells holding the same digit as the selected one
	cellError: number;
	cellGiven: number; // locked (pre-filled) cell bg
	cellOpponentSelected?: number; // opponent’s active cell (shown in read-only board)
	/** Background for opponent cells that are filled but digits are hidden */
	cellOpponentFilled?: number;
	gridLine: number;
	gridLineThick: number; // box borders
	digitGiven: number;
	digitPlayer: number;
	/** Optional per-cell marker palette for player digits, cycled by (row+col) */
	digitPlayerMarkers?: number[];
	digitError: number;
	digitHint?: number;       // hint-revealed digit (optional, falls back to digitPlayer)
	digitCandidate: number;
	fontFamily?: string;      // custom font (default: system-ui)
	digitScale?: number;      // fontSize = cellSize * digitScale (default: 0.56)
	gridLineWidth?: number;   // thin cell line width (default: 1)
	gridLineThickWidth?: number; // box border width (default: 2.5)
	/** Skip drawing the outermost border lines (the CSS wrapper provides the frame) */
	skipOuterBorder?: boolean;
}

export const lightTheme: BoardTheme = {
	background: 0xf5f5f5,
	cellBackground: 0xffffff,
	cellBackgroundAlt: 0xf0f4ff,
	cellSelected: 0xbbd6fb,
	cellHighlighted: 0xdaeafe,
	cellError: 0xffe0e0,
	cellGiven: 0xeceff8,
	cellOpponentFilled: 0xc5d8f5,
	gridLine: 0xb0b8cc,
	gridLineThick: 0x3a4560,
	digitGiven: 0x1a2340,
	digitPlayer: 0x2563eb,
	digitError: 0xdc2626,
	digitCandidate: 0x6b7280
};

/**
 * "Kraft Draft" board theme — warm paper, ink frame, handwritten marker digits.
 * Cell-state colors carried 1:1 from NerdDen Game.dc.html. The rounded ink frame
 * and offset shadow are applied via CSS on the board wrapper, so the renderer
 * skips its outer border lines.
 */
export const notebookTheme: BoardTheme = {
	background: 0xfbf8f1,         // cream inside the frame
	cellBackground: 0xffffff,
	cellBackgroundAlt: 0xffffff,  // no alternating box tint
	cellSelected: 0xeccbb9,
	cellHighlighted: 0xefe7d4,    // peers (row/col/box)
	cellSameDigit: 0xdbe5ee,      // cells with the same digit as the selection
	cellError: 0xf4d7cf,
	cellGiven: 0xffffff,          // given cells are plain white
	cellOpponentSelected: 0xeccbb9,
	cellOpponentFilled: 0xddd3bf, // filled but digit hidden (opponent board)
	gridLine: 0xdcd5c6,           // thin lines
	gridLineThick: 0x322c24,      // ink box borders
	digitGiven: 0x322c24,         // ink
	digitPlayer: 0xb5462e,        // fallback marker (red)
	digitPlayerMarkers: [0xb5462e, 0x3e5c76, 0x5b7355], // red / blue / green
	digitError: 0xc81e1e,
	digitHint: 0x5b7355,          // green marker
	digitCandidate: 0x8a8474,
	fontFamily: 'Caveat, cursive',
	digitScale: 0.62,
	gridLineWidth: 1,
	gridLineThickWidth: 2,
	skipOuterBorder: true
};

export const darkTheme: BoardTheme = {
	background: 0x1a1d2e,
	cellBackground: 0x22263a,
	cellBackgroundAlt: 0x1e2235,
	cellSelected: 0x1e3a5f,
	cellHighlighted: 0x1c2d4a,
	cellError: 0x4a1c1c,
	cellGiven: 0x2a2f45,
	cellOpponentFilled: 0x303654,
	gridLine: 0x3a4055,
	gridLineThick: 0x8899cc,
	digitGiven: 0xe8eaf6,
	digitPlayer: 0x60a5fa,
	digitError: 0xf87171,
	digitCandidate: 0x6b7a99
};
