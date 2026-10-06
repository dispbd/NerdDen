/**
 * Pure board logic for the nonogram renderer: what a cell shows, what a stroke does,
 * which lines are satisfied, and how the board fits a box. No PixiJS here, so all of it
 * is unit-tested; `src/lib/pixi/NonogramBoard.ts` only draws what these functions decide.
 */

import { lineSatisfies, type Clue } from './solver';
import { cellKey, type NonogramMove, type PlayerGrid, type Reveal } from './types';

export type Tool = 'fill' | 'mark';

/** What one playfield cell shows. Revealed cells are locked. */
export type CellView = 'empty' | 'filled' | 'marked' | 'revealed-filled' | 'revealed-empty';

export interface Cell {
	x: number;
	y: number;
}

export function revealMap(reveals: readonly Reveal[]): Map<string, Reveal['state']> {
	return new Map(reveals.map((r) => [cellKey(r.x, r.y), r.state]));
}

export function cellView(
	x: number,
	y: number,
	grid: PlayerGrid,
	revealed: ReadonlyMap<string, Reveal['state']>
): CellView {
	const k = cellKey(x, y);
	const r = revealed.get(k);
	if (r) return r === 'filled' ? 'revealed-filled' : 'revealed-empty';
	return grid[k] ?? 'empty';
}

/**
 * A stroke's action is fixed by the first cell it touches, and from then on it only
 * changes cells in that same state — so dragging a fill across a row never erases the
 * crosses already in it. `null` means the stroke does nothing.
 *
 * Fills are confirmed by the server, so a filled cell is known to be right: neither tool
 * strokes over it (Undo still can). The Mark tool toggles: on a cross it clears crosses.
 */
export function strokeActionFor(
	tool: Tool,
	view: CellView
): { action: NonogramMove['action']; target: 'empty' | 'marked' } | null {
	if (view === 'empty') return { action: tool, target: 'empty' };
	if (tool === 'mark' && view === 'marked') return { action: 'clear', target: 'marked' };
	return null;
}

/**
 * Strokes run along one line, like ruling a pencil line. The axis is taken from the
 * first move away from the anchor cell.
 */
export function lockAxis(anchor: Cell, to: Cell): 'row' | 'col' | null {
	const dx = Math.abs(to.x - anchor.x);
	const dy = Math.abs(to.y - anchor.y);
	if (!dx && !dy) return null;
	return dx >= dy ? 'row' : 'col';
}

/**
 * Every cell from the anchor to the pointer along the locked axis, inclusive. Filling
 * the whole span means a fast drag that skips cells between pointer events still paints
 * a solid run.
 */
export function strokeCells(anchor: Cell, to: Cell, axis: 'row' | 'col' | null): Cell[] {
	if (!axis) return [{ ...anchor }];
	const from = axis === 'row' ? anchor.x : anchor.y;
	const end = axis === 'row' ? to.x : to.y;
	const step = end >= from ? 1 : -1;
	const out: Cell[] = [];
	for (let i = from; i !== end + step; i += step) {
		out.push(axis === 'row' ? { x: i, y: anchor.y } : { x: anchor.x, y: i });
	}
	return out;
}

/** An empty line's clue is drawn as a single "0", never left blank. */
export function displayClue(clue: Clue): number[] {
	return clue.length ? clue : [0];
}

/** Which rows and columns the player's fills (plus revealed fills) satisfy exactly. */
export function satisfiedLines(
	rowClues: readonly Clue[],
	colClues: readonly Clue[],
	grid: PlayerGrid,
	revealed: ReadonlyMap<string, Reveal['state']>
): { rows: boolean[]; cols: boolean[] } {
	const n = rowClues.length;
	const filled = (x: number, y: number) => {
		const v = cellView(x, y, grid, revealed);
		return v === 'filled' || v === 'revealed-filled';
	};
	const rows = rowClues.map((clue, y) =>
		lineSatisfies(
			Array.from({ length: n }, (_, x) => filled(x, y)),
			clue
		)
	);
	const cols = colClues.map((clue, x) =>
		lineSatisfies(
			Array.from({ length: n }, (_, y) => filled(x, y)),
			clue
		)
	);
	return { rows, cols };
}

// ─── Geometry ────────────────────────────────────────────────────────────────

export interface BoardLayout {
	/** Playfield cell edge, px */
	cell: number;
	/** Clue font size, px */
	font: number;
	/** Width of one number slot in the left (row) gutter */
	rowSlot: number;
	/** Height of one number slot in the top (column) gutter */
	colSlot: number;
	gutterW: number;
	gutterH: number;
	/** Whole board (gutters + field) */
	width: number;
	height: number;
	/** Top-left of the board inside the box, centring it */
	originX: number;
	originY: number;
}

export const MIN_CELL = 12;
const FONT_MIN = 9;
const FONT_MAX = 13;
const GUTTER_PAD = 4;

/**
 * Clue slots are narrower than cells (a slot only has to hold a two-digit number), so
 * a 15×15 board with long clues still fits a phone. The font is clamped to stay legible,
 * which makes slot size depend on cell size — hence the search from the largest cell down.
 */
export function layoutFor(
	width: number,
	height: number,
	n: number,
	rowSlots: number,
	colSlots: number,
	maxCell: number
): BoardLayout {
	let cell = Math.max(MIN_CELL, Math.floor(maxCell));
	let shape = shapeAt(cell, n, rowSlots, colSlots);
	while (cell > MIN_CELL && (shape.width > width || shape.height > height)) {
		cell--;
		shape = shapeAt(cell, n, rowSlots, colSlots);
	}
	return {
		cell,
		...shape,
		originX: Math.max(0, Math.floor((width - shape.width) / 2)),
		originY: Math.max(0, Math.floor((height - shape.height) / 2))
	};
}

function shapeAt(cell: number, n: number, rowSlots: number, colSlots: number) {
	const font = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(cell * 0.42)));
	const rowSlot = Math.ceil(font * 1.45);
	const colSlot = Math.ceil(font * 1.25);
	const gutterW = rowSlots * rowSlot + GUTTER_PAD;
	const gutterH = colSlots * colSlot + GUTTER_PAD;
	return {
		font,
		rowSlot,
		colSlot,
		gutterW,
		gutterH,
		width: gutterW + n * cell,
		height: gutterH + n * cell
	};
}

/** The board's size when it has all the room it wants — the wrapper sizes itself to this. */
export function naturalSize(n: number, rowSlots: number, colSlots: number, maxCell: number) {
	const s = layoutFor(Infinity, Infinity, n, rowSlots, colSlots, maxCell);
	return { width: s.width, height: s.height };
}

/** Largest cell per board size: small boards get big, thumb-friendly cells. */
export function maxCellFor(n: number): number {
	return n <= 5 ? 48 : n <= 10 ? 34 : 30;
}

/** Slots each gutter needs: the longest clue on that side. */
export function gutterSlots(rowClues: readonly Clue[], colClues: readonly Clue[]) {
	const longest = (clues: readonly Clue[]) =>
		Math.max(1, ...clues.map((c) => displayClue(c).length));
	return { rowSlots: longest(rowClues), colSlots: longest(colClues) };
}

/** Playfield cell under a point given in board-box px; `clamp` pins it to the edge. */
export function cellAtPoint(
	px: number,
	py: number,
	layout: BoardLayout,
	n: number,
	clamp = false
): Cell | null {
	const fx = (px - layout.originX - layout.gutterW) / layout.cell;
	const fy = (py - layout.originY - layout.gutterH) / layout.cell;
	let x = Math.floor(fx);
	let y = Math.floor(fy);
	if (clamp) {
		x = Math.min(n - 1, Math.max(0, x));
		y = Math.min(n - 1, Math.max(0, y));
	} else if (x < 0 || y < 0 || x >= n || y >= n) {
		return null;
	}
	return { x, y };
}
