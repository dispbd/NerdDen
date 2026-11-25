/**
 * Why a single is forced, as a short list of facts computed from the board — for v4, where
 * the model only puts the solver's argument into words. Every fact names where the blocking
 * digit stands, so the model has nothing to work out (or invent).
 *
 * Hidden single in a unit: every other empty cell of that unit is ruled out for the digit,
 * grouped by the row/column/box that rules it out.
 * Naked single: every other digit is already in the cell's row, column or box.
 */
import type { Grid } from '../../src/lib/games/sudoku/shared.ts';
import { unitCells, type Unit } from './facts.ts';
import { boxOf, type Move } from './sudoku.ts';

const NAME: Record<Unit, string> = { row: 'row', col: 'column', box: 'box' };
const cell = (r: number, c: number) => `r${r + 1}c${c + 1}`;

function unitsOf(r: number, c: number): [Unit, number][] {
	return [
		['row', r + 1],
		['col', c + 1],
		['box', boxOf(r, c) + 1]
	];
}

/** The first of the cell's row, column, box that already holds `d`, with the cell holding it. */
function blocker(g: Grid, r: number, c: number, d: number, skip?: [Unit, number]) {
	for (const [u, i] of unitsOf(r, c)) {
		if (skip && skip[0] === u && skip[1] === i) continue;
		const at = unitCells(u, i).find(([rr, cc]) => g[rr][cc] === d);
		if (at) return { unit: u, index: i, at };
	}
	return null;
}

export function moveProof(g: Grid, m: Move): string[] {
	const r0 = m.row - 1;
	const c0 = m.col - 1;

	if (m.technique === 'naked-single') {
		// group the other eight digits by the unit that already holds them
		const groups = new Map<string, string[]>();
		for (let d = 1; d <= 9; d++) {
			if (d === m.digit) continue;
			const b = blocker(g, r0, c0, d);
			if (!b) throw new Error(`not a naked single: ${d} is possible at ${cell(r0, c0)}`);
			const key = `${NAME[b.unit]} ${b.index}`;
			groups.set(key, [...(groups.get(key) ?? []), `${d} (${cell(...b.at)})`]);
		}
		return [
			`Cell ${cell(r0, c0)} is empty.`,
			...[...groups].map(([unit, ds]) => `${unit[0].toUpperCase() + unit.slice(1)} already has ${ds.join(', ')}.`),
			`So the only digit left for ${cell(r0, c0)} is ${m.digit}.`
		];
	}

	const unit: Unit = m.technique === 'hidden-single-row' ? 'row' : m.technique === 'hidden-single-col' ? 'col' : 'box';
	const index = m.unit!;
	const empty = unitCells(unit, index).filter(([r, c]) => g[r][c] === 0);
	const others = empty.filter(([r, c]) => !(r === r0 && c === c0));
	// group the other empty cells by what rules the digit out of them
	const groups = new Map<string, string[]>();
	for (const [r, c] of others) {
		const b = blocker(g, r, c, m.digit, [unit, index]);
		if (!b) throw new Error(`not a hidden single: ${m.digit} is possible at ${cell(r, c)}`);
		const key = `${NAME[b.unit]} ${b.index} already has a ${m.digit} (${cell(...b.at)})`;
		groups.set(key, [...(groups.get(key) ?? []), cell(r, c)]);
	}
	return [
		`${m.digit} is not yet in ${NAME[unit]} ${index}. Its empty cells: ${empty.map(([r, c]) => cell(r, c)).join(', ')}.`,
		...[...groups].map(([why, cells]) => `${why[0].toUpperCase() + why.slice(1)}, so ${m.digit} cannot go in ${cells.join(', ')}.`),
		others.length
			? `So ${cell(r0, c0)} is the only cell of ${NAME[unit]} ${index} left for ${m.digit}.`
			: `${cell(r0, c0)} is the last empty cell of ${NAME[unit]} ${index}, so it takes the missing ${m.digit}.`
	];
}
