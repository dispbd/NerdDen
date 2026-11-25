/**
 * Deterministic Sudoku helpers for scoring hints (9×9 only).
 * A "logical next move" here is a single: a naked single (the cell has one candidate)
 * or a hidden single (a digit fits only one cell of a row, column or box).
 */
import type { Grid } from '../../src/lib/games/sudoku/shared.ts';

export type Technique = 'naked-single' | 'hidden-single-row' | 'hidden-single-col' | 'hidden-single-box';

export interface Move {
	/** 1-based, as players and prompts count */
	row: number;
	col: number;
	digit: number;
	technique: Technique;
	/** 1-based index of the row / column / box that makes it a hidden single */
	unit?: number;
}

export const boxOf = (r: number, c: number) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

export function candidates(grid: Grid, r: number, c: number): number[] {
	if (grid[r][c] !== 0) return [];
	const used = new Set<number>();
	for (let i = 0; i < 9; i++) {
		used.add(grid[r][i]);
		used.add(grid[i][c]);
	}
	const br = Math.floor(r / 3) * 3;
	const bc = Math.floor(c / 3) * 3;
	for (let i = br; i < br + 3; i++) for (let j = bc; j < bc + 3; j++) used.add(grid[i][j]);
	return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n));
}

/** All singles available on the board, deduplicated per cell (first technique wins). */
export function findSingles(grid: Grid): Move[] {
	const cand: number[][][] = grid.map((row, r) => row.map((_, c) => candidates(grid, r, c)));
	const moves = new Map<string, Move>();
	const add = (m: Move) => {
		const key = `${m.row},${m.col}`;
		if (!moves.has(key)) moves.set(key, m);
	};

	// Hidden singles first: they are the moves people usually spot.
	const units: { technique: Technique; cells: (i: number) => [number, number][] }[] = [
		{ technique: 'hidden-single-box', cells: (b) => box(b) },
		{ technique: 'hidden-single-row', cells: (r) => Array.from({ length: 9 }, (_, c) => [r, c]) },
		{ technique: 'hidden-single-col', cells: (c) => Array.from({ length: 9 }, (_, r) => [r, c]) }
	];
	for (const { technique, cells } of units) {
		for (let u = 0; u < 9; u++) {
			for (let d = 1; d <= 9; d++) {
				const spots = cells(u).filter(([r, c]) => cand[r][c].includes(d));
				if (spots.length === 1) {
					const [r, c] = spots[0];
					add({ row: r + 1, col: c + 1, digit: d, technique, unit: u + 1 });
				}
			}
		}
	}
	for (let r = 0; r < 9; r++)
		for (let c = 0; c < 9; c++)
			if (cand[r][c].length === 1) add({ row: r + 1, col: c + 1, digit: cand[r][c][0], technique: 'naked-single' });

	return [...moves.values()];
}

function box(b: number): [number, number][] {
	const br = Math.floor(b / 3) * 3;
	const bc = (b % 3) * 3;
	const out: [number, number][] = [];
	for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) out.push([r, c]);
	return out;
}

export function describeMove(m: Move): string {
	const cell = `row ${m.row}, column ${m.col}`;
	switch (m.technique) {
		case 'naked-single':
			return `${m.digit} at ${cell}: it is the only digit that fits this cell (naked single)`;
		case 'hidden-single-row':
			return `${m.digit} at ${cell}: in row ${m.unit}, ${m.digit} fits only this cell (hidden single)`;
		case 'hidden-single-col':
			return `${m.digit} at ${cell}: in column ${m.unit}, ${m.digit} fits only this cell (hidden single)`;
		case 'hidden-single-box':
			return `${m.digit} at ${cell}: in box ${m.unit}, ${m.digit} fits only this cell (hidden single)`;
	}
}

/** Board with 1-based row/column labels and box separators. */
export function labelledBoard(grid: Grid): string {
	const header = '     c1 c2 c3   c4 c5 c6   c7 c8 c9';
	const lines = grid.map((row, r) => {
		const cells = row.map((v) => (v === 0 ? '.' : String(v)).padStart(2, ' '));
		const groups = [cells.slice(0, 3), cells.slice(3, 6), cells.slice(6, 9)].map((g) => g.join(' '));
		return `r${r + 1}  ${groups.join(' | ')}`;
	});
	const sep = '    ' + '-'.repeat(header.length - 4);
	return [header, ...lines.slice(0, 3), sep, ...lines.slice(3, 6), sep, ...lines.slice(6)].join('\n');
}
