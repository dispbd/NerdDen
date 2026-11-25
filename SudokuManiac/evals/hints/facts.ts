/**
 * Ground truth about a board, for judging explanations:
 * - referenceFacts(): text the LLM judge gets, so it checks claims instead of solving Sudoku;
 * - verifyClaims(): deterministic check of structured claims parsed out of an explanation.
 */
import type { Grid } from '../../src/lib/games/sudoku/shared.ts';
import { boxOf, candidates, type Move } from './sudoku.ts';

export type Unit = 'row' | 'col' | 'box';
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 0-based cells of a unit; index is 1-based like everywhere players see. */
export function unitCells(unit: Unit, index: number): [number, number][] {
	const i = index - 1;
	if (unit === 'row') return DIGITS.map((_, c) => [i, c]);
	if (unit === 'col') return DIGITS.map((_, r) => [r, i]);
	const br = Math.floor(i / 3) * 3;
	const bc = (i % 3) * 3;
	return DIGITS.map((_, k) => [br + Math.floor(k / 3), bc + (k % 3)]);
}

export const present = (g: Grid, unit: Unit, index: number) =>
	unitCells(unit, index)
		.map(([r, c]) => g[r][c])
		.filter(Boolean)
		.sort();
export const missing = (g: Grid, unit: Unit, index: number) => {
	const p = new Set(present(g, unit, index));
	return DIGITS.filter((d) => !p.has(d));
};
/** Empty cells of a unit where `digit` is still a candidate (0-based). */
export const placesFor = (g: Grid, unit: Unit, index: number, digit: number) =>
	unitCells(unit, index).filter(([r, c]) => candidates(g, r, c).includes(digit));

const NAME: Record<Unit, string> = { row: 'Row', col: 'Column', box: 'Box' };

export function referenceFacts(g: Grid, move: { row: number; col: number; digit: number }): string {
	const lines: string[] = ['Digits still missing from every unit (computed, always correct):'];
	for (const unit of ['row', 'col', 'box'] as Unit[])
		for (let i = 1; i <= 9; i++) lines.push(`- ${NAME[unit]} ${i}: missing {${missing(g, unit, i).join(', ')}}`);

	const r = move.row - 1;
	const c = move.col - 1;
	const b = boxOf(r, c) + 1;
	lines.push(
		'',
		`The move explained: ${move.digit} at row ${move.row}, column ${move.col} (box ${b}).`,
		`Candidates of that cell (digits not yet in its row, column or box): {${candidates(g, r, c).join(', ')}}.`
	);
	for (const [unit, index] of [
		['row', move.row],
		['col', move.col],
		['box', b]
	] as [Unit, number][]) {
		const spots = placesFor(g, unit, index, move.digit).map(([rr, cc]) => `r${rr + 1}c${cc + 1}`);
		lines.push(`Cells of ${NAME[unit].toLowerCase()} ${index} where ${move.digit} can still go: ${spots.join(', ') || 'none'}.`);
	}
	return lines.join('\n');
}

// ─── structured claims ───────────────────────────────────────────────────────

export type Claim =
	| { type: 'present'; unit: Unit; index: number; digits: number[] }
	| { type: 'missing'; unit: Unit; index: number; digits: number[]; exhaustive: boolean }
	| { type: 'candidates'; row: number; col: number; digits: number[]; exhaustive: boolean }
	| { type: 'excluded'; row: number; col: number; digit: number }
	| { type: 'only_place'; unit: Unit; index: number; digit: number; row: number; col: number }
	| { type: 'other'; text: string };

export interface ClaimCheck {
	claim: Claim;
	/** null: not checkable by code */
	ok: boolean | null;
	why?: string;
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

export function verifyClaim(g: Grid, claim: Claim): ClaimCheck {
	switch (claim.type) {
		case 'present': {
			const p = present(g, claim.unit, claim.index);
			const bad = claim.digits.filter((d) => !p.includes(d));
			return { claim, ok: !bad.length, why: bad.length ? `${claim.unit} ${claim.index} has no ${bad.join(', ')}` : undefined };
		}
		case 'missing': {
			const m = missing(g, claim.unit, claim.index);
			const ok = claim.exhaustive ? sameSet(claim.digits, m) : claim.digits.every((d) => m.includes(d));
			return { claim, ok, why: ok ? undefined : `${claim.unit} ${claim.index} is missing {${m.join(', ')}}` };
		}
		case 'candidates': {
			const cand = candidates(g, claim.row - 1, claim.col - 1);
			const ok = claim.exhaustive ? sameSet(claim.digits, cand) : claim.digits.every((d) => cand.includes(d));
			if (!ok) {
				// The parser often files "column 1 leaves {3,4,5,8}" (one unit) as the cell's
				// candidates. If the digits are exactly what one of the cell's units lacks, read it so.
				const unit = unitsOf(claim.row - 1, claim.col - 1).find(([u, i]) => sameSet(claim.digits, missing(g, u, i)));
				if (unit)
					return {
						claim: { type: 'missing', unit: unit[0], index: unit[1], digits: claim.digits, exhaustive: true },
						ok: true,
						why: `read as ${unit[0]} ${unit[1]} missing`
					};
			}
			return { claim, ok, why: ok ? undefined : `r${claim.row}c${claim.col} candidates are {${cand.join(', ')}}` };
		}
		case 'excluded': {
			// "8 can't go in r2c4" about a filled cell is vacuous, whatever reason the text gave.
			if (g[claim.row - 1][claim.col - 1] !== 0) return { claim, ok: null, why: 'cell already filled' };
			const ok = !candidates(g, claim.row - 1, claim.col - 1).includes(claim.digit);
			return { claim, ok, why: ok ? undefined : `${claim.digit} is still possible at r${claim.row}c${claim.col}` };
		}
		case 'only_place': {
			const spots = placesFor(g, claim.unit, claim.index, claim.digit);
			const ok = spots.length === 1 && spots[0][0] === claim.row - 1 && spots[0][1] === claim.col - 1;
			return {
				claim,
				ok,
				why: ok ? undefined : `${claim.digit} can go in ${claim.unit} ${claim.index} at ${spots.map(([r, c]) => `r${r + 1}c${c + 1}`).join(', ') || 'no cell'}`
			};
		}
		case 'other':
			return { claim, ok: null };
	}
}

/** The row, column and box (1-based) that contain a 0-based cell. */
function unitsOf(r: number, c: number): [Unit, number][] {
	return [
		['row', r + 1],
		['col', c + 1],
		['box', boxOf(r, c) + 1]
	];
}
const inUnit = (unit: Unit, index: number, r: number, c: number) => unitsOf(r, c).some(([u, i]) => u === unit && i === index);

/**
 * Do the true claims establish the move? Two ways, each a complete argument:
 * - cell elimination: a full list of what the cell may hold (a unit's missing digits or the
 *   cell's candidates) with every other digit ruled out for that cell by other claims
 *   ("row 5 lacks {2,3,6,9}; column 6 has 9, 2 and 6 → 3");
 * - unit elimination: every other empty cell of a unit is ruled out for the digit
 *   ("row 1 has a 6, column 1 has a 6 → only r3c2 left in box 1").
 * A claim rules a digit out of a cell if it is excluded there, already present in one of
 * its units, or absent from a full list of a unit's missing digits.
 */
export function claimsEstablishMove(g: Grid, move: Move | { row: number; col: number; digit: number }, checks: ClaimCheck[]): boolean {
	const trueClaims = checks.filter((x) => x.ok).map((x) => x.claim);
	// A list that happens to be complete counts as complete, whatever the parser marked.
	const full = (cl: Claim) => cl.type === 'missing' && (cl.exhaustive || sameSet(cl.digits, missing(g, cl.unit, cl.index)));

	const ruledOut = (r: number, c: number, d: number) =>
		trueClaims.some((cl) => {
			if (cl.type === 'excluded') return cl.row - 1 === r && cl.col - 1 === c && cl.digit === d;
			if (cl.type === 'present') return inUnit(cl.unit, cl.index, r, c) && cl.digits.includes(d);
			if (cl.type === 'missing') return full(cl) && inUnit(cl.unit, cl.index, r, c) && !cl.digits.includes(d);
			if (cl.type === 'candidates') return cl.exhaustive && cl.row - 1 === r && cl.col - 1 === c && !cl.digits.includes(d);
			return false;
		});

	// "The only place for 8 in box 2 is r1c4" is the conclusion, not a reason: it only names
	// the unit, and the other cells of that unit still have to be ruled out (Q3 in the labels).
	const r0 = move.row - 1;
	const c0 = move.col - 1;

	const lists = trueClaims.flatMap((cl) => {
		if (cl.type === 'missing' && full(cl) && inUnit(cl.unit, cl.index, r0, c0)) return [cl.digits];
		if (cl.type === 'candidates' && cl.exhaustive && cl.row === move.row && cl.col === move.col) return [cl.digits];
		return [];
	});
	if (lists.some((ds) => ds.includes(move.digit) && ds.every((d) => d === move.digit || ruledOut(r0, c0, d)))) return true;

	return unitsOf(r0, c0).some(([u, i]) => {
		const others = unitCells(u, i).filter(([r, c]) => !(r === r0 && c === c0) && g[r][c] === 0);
		// The last empty cell of a unit: the explanation must at least point at that unit.
		if (!others.length) return trueClaims.some((cl) => 'unit' in cl && cl.unit === u && cl.index === i);
		return others.every(([r, c]) => ruledOut(r, c, move.digit));
	});
}
