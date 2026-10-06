import { describe, expect, it } from 'vitest';
import {
	cellAtPoint,
	cellView,
	displayClue,
	gutterSlots,
	layoutFor,
	lockAxis,
	MIN_CELL,
	naturalSize,
	revealMap,
	satisfiedLines,
	strokeActionFor,
	strokeCells
} from './board';
import { computeClues } from './solver';
import type { PlayerGrid } from './types';

describe('cellView', () => {
	const revealed = revealMap([
		{ x: 0, y: 0, state: 'filled' },
		{ x: 1, y: 0, state: 'empty' }
	]);

	it('shows a reveal over whatever the player grid says', () => {
		const grid: PlayerGrid = { '0,0': 'marked', '1,0': 'filled' };
		expect(cellView(0, 0, grid, revealed)).toBe('revealed-filled');
		expect(cellView(1, 0, grid, revealed)).toBe('revealed-empty');
	});

	it('keys the player grid by x,y', () => {
		const grid: PlayerGrid = { '2,1': 'filled', '1,2': 'marked' };
		expect(cellView(2, 1, grid, revealed)).toBe('filled');
		expect(cellView(1, 2, grid, revealed)).toBe('marked');
		expect(cellView(2, 2, grid, revealed)).toBe('empty');
	});
});

describe('strokeActionFor', () => {
	it('paints the tool onto empty cells', () => {
		expect(strokeActionFor('fill', 'empty')).toEqual({ action: 'fill', target: 'empty' });
		expect(strokeActionFor('mark', 'empty')).toEqual({ action: 'mark', target: 'empty' });
	});

	it('lets the mark tool clear crosses, but not the fill tool', () => {
		expect(strokeActionFor('mark', 'marked')).toEqual({ action: 'clear', target: 'marked' });
		expect(strokeActionFor('fill', 'marked')).toBeNull();
	});

	it('never strokes over a confirmed fill or a reveal', () => {
		for (const tool of ['fill', 'mark'] as const) {
			expect(strokeActionFor(tool, 'filled')).toBeNull();
			expect(strokeActionFor(tool, 'revealed-filled')).toBeNull();
			expect(strokeActionFor(tool, 'revealed-empty')).toBeNull();
		}
	});
});

describe('strokes', () => {
	it('locks to the axis of the larger move, row on a tie', () => {
		expect(lockAxis({ x: 3, y: 3 }, { x: 3, y: 3 })).toBeNull();
		expect(lockAxis({ x: 3, y: 3 }, { x: 5, y: 4 })).toBe('row');
		expect(lockAxis({ x: 3, y: 3 }, { x: 4, y: 1 })).toBe('col');
		expect(lockAxis({ x: 3, y: 3 }, { x: 4, y: 4 })).toBe('row');
	});

	it('covers the whole span, so a fast drag leaves no gaps', () => {
		expect(strokeCells({ x: 1, y: 2 }, { x: 4, y: 7 }, 'row')).toEqual([
			{ x: 1, y: 2 },
			{ x: 2, y: 2 },
			{ x: 3, y: 2 },
			{ x: 4, y: 2 }
		]);
	});

	it('runs backwards and down columns too', () => {
		expect(strokeCells({ x: 2, y: 3 }, { x: 0, y: 0 }, 'col')).toEqual([
			{ x: 2, y: 3 },
			{ x: 2, y: 2 },
			{ x: 2, y: 1 },
			{ x: 2, y: 0 }
		]);
		expect(strokeCells({ x: 2, y: 3 }, { x: 0, y: 3 }, 'row').map((c) => c.x)).toEqual([2, 1, 0]);
	});

	it('is just the anchor before an axis is chosen', () => {
		expect(strokeCells({ x: 2, y: 3 }, { x: 2, y: 3 }, null)).toEqual([{ x: 2, y: 3 }]);
	});
});

describe('satisfiedLines', () => {
	// Rows: "#.#", "...", "###" — so row 1 is the empty line with clue [].
	const solution = [
		[1, 0, 1],
		[0, 0, 0],
		[1, 1, 1]
	];
	const { rowClues, colClues } = computeClues(solution);

	it('treats an empty line as satisfied from the start', () => {
		const s = satisfiedLines(rowClues, colClues, {}, new Map());
		expect(s.rows).toEqual([false, true, false]);
		expect(s.cols).toEqual([false, false, false]);
	});

	it('counts revealed fills alongside the player’s', () => {
		const grid: PlayerGrid = { '0,0': 'filled', '0,2': 'filled' };
		const s = satisfiedLines(
			rowClues,
			colClues,
			grid,
			revealMap([{ x: 2, y: 0, state: 'filled' }])
		);
		expect(s.rows).toEqual([true, true, false]);
		expect(s.cols).toEqual([true, false, false]);
	});

	it('ignores crosses — only fills make a run', () => {
		const grid: PlayerGrid = { '0,2': 'filled', '1,2': 'marked', '2,2': 'filled' };
		expect(satisfiedLines(rowClues, colClues, grid, new Map()).rows[2]).toBe(false);
	});
});

describe('layout', () => {
	it('draws an empty clue as 0 and sizes gutters by the longest clue', () => {
		expect(displayClue([])).toEqual([0]);
		expect(displayClue([1, 2])).toEqual([1, 2]);
		expect(gutterSlots([[], [1, 1, 1], [2]], [[3], []])).toEqual({ rowSlots: 3, colSlots: 1 });
	});

	it('uses the full cell size when there is room', () => {
		const l = layoutFor(2000, 2000, 10, 3, 4, 34);
		expect(l.cell).toBe(34);
		expect(l.width).toBe(l.gutterW + 340);
		expect(l.height).toBe(l.gutterH + 340);
	});

	it('shrinks to fit a phone and stays inside the box', () => {
		// A hard 15×15 with 8-number clues on a 358px-wide phone.
		const l = layoutFor(358, 600, 15, 8, 8, 30);
		expect(l.width).toBeLessThanOrEqual(358);
		expect(l.height).toBeLessThanOrEqual(600);
		expect(l.cell).toBeGreaterThanOrEqual(MIN_CELL);
		// Font is clamped to stay legible even as cells shrink.
		expect(l.font).toBeGreaterThanOrEqual(9);
		// One cell larger would not have fitted.
		expect(layoutFor(358, 600, 15, 8, 8, l.cell + 1).cell).toBe(l.cell);
		expect(layoutFor(Infinity, Infinity, 15, 8, 8, l.cell + 1).width).toBeGreaterThan(358);
	});

	it('centres the board in a larger box', () => {
		const nat = naturalSize(5, 2, 2, 48);
		const l = layoutFor(nat.width + 100, nat.height + 40, 5, 2, 2, 48);
		expect(l.originX).toBe(50);
		expect(l.originY).toBe(20);
	});

	it('maps points to cells, skipping the gutters', () => {
		const l = layoutFor(1000, 1000, 10, 2, 3, 30);
		const at = (cx: number, cy: number) =>
			cellAtPoint(
				l.originX + l.gutterW + cx * l.cell + 1,
				l.originY + l.gutterH + cy * l.cell + 1,
				l,
				10
			);
		expect(at(0, 0)).toEqual({ x: 0, y: 0 });
		expect(at(9, 4)).toEqual({ x: 9, y: 4 });
		// Grid-line pixels belong to a cell: there is no dead zone between cells.
		expect(cellAtPoint(l.originX + l.gutterW + l.cell, l.originY + l.gutterH, l, 10)).toEqual({
			x: 1,
			y: 0
		});
		expect(cellAtPoint(l.originX + 2, l.originY + l.gutterH + 5, l, 10)).toBeNull();
		expect(cellAtPoint(l.originX + 2, l.originY + l.gutterH + 5, l, 10, true)).toEqual({
			x: 0,
			y: 0
		});
		expect(cellAtPoint(99999, -5, l, 10, true)).toEqual({ x: 9, y: 0 });
	});
});
