import { describe, expect, it } from 'vitest';
import { MAX_MISTAKES } from '$lib/games/nonogram/types';
import { applyMoves, isComplete, pickHintCell, progressOf, type PlayState } from './play';

// A 3×3 picture:  # # .
//                 . # .
//                 . # #
const SOLUTION = [
	[1, 1, 0],
	[0, 1, 0],
	[0, 1, 1]
];
const fresh = (): PlayState => ({ playerGrid: {}, mistakes: 0, status: 'in_progress' });

describe('applyMoves', () => {
	it('keeps a correct fill', () => {
		const out = applyMoves(SOLUTION, [], fresh(), [{ x: 0, y: 0, action: 'fill' }]);
		expect(out.playerGrid['0,0']).toBe('filled');
		expect(out.mistakes).toBe(0);
		expect(out.wrong).toEqual([]);
	});

	it('charges a wrong fill as a mistake and crosses the cell out', () => {
		const out = applyMoves(SOLUTION, [], fresh(), [{ x: 2, y: 0, action: 'fill' }]);
		expect(out.mistakes).toBe(1);
		expect(out.playerGrid['2,0']).toBe('marked');
		expect(out.wrong).toEqual([{ x: 2, y: 0 }]);
	});

	it(`loses at ${MAX_MISTAKES} mistakes and ignores later moves`, () => {
		const out = applyMoves(SOLUTION, [], fresh(), [
			{ x: 2, y: 0, action: 'fill' },
			{ x: 0, y: 1, action: 'fill' },
			{ x: 2, y: 1, action: 'fill' },
			{ x: 0, y: 0, action: 'fill' } // after the loss — must be ignored
		]);
		expect(out.status).toBe('failed');
		expect(out.mistakes).toBe(MAX_MISTAKES);
		expect(out.playerGrid['0,0']).toBeUndefined();
	});

	it('completes when every picture cell is filled, counting filled reveals', () => {
		const reveals = [{ x: 1, y: 1, state: 'filled' as const }];
		const out = applyMoves(SOLUTION, reveals, fresh(), [
			{ x: 0, y: 0, action: 'fill' },
			{ x: 1, y: 0, action: 'fill' },
			{ x: 1, y: 2, action: 'fill' },
			{ x: 2, y: 2, action: 'fill' }
		]);
		expect(out.status).toBe('completed');
	});

	it('locks revealed cells', () => {
		const reveals = [{ x: 2, y: 0, state: 'empty' as const }];
		const out = applyMoves(SOLUTION, reveals, fresh(), [{ x: 2, y: 0, action: 'fill' }]);
		expect(out.mistakes).toBe(0);
		expect(out.playerGrid['2,0']).toBeUndefined();
	});

	it('does not let a confirmed fill be crossed out, but lets marks be cleared', () => {
		let out = applyMoves(SOLUTION, [], fresh(), [
			{ x: 0, y: 0, action: 'fill' },
			{ x: 0, y: 0, action: 'mark' },
			{ x: 0, y: 2, action: 'mark' }
		]);
		expect(out.playerGrid['0,0']).toBe('filled');
		expect(out.playerGrid['0,2']).toBe('marked');
		out = applyMoves(SOLUTION, [], out, [{ x: 0, y: 2, action: 'clear' }]);
		expect(out.playerGrid['0,2']).toBeUndefined();
	});

	it('ignores out-of-bounds and malformed moves', () => {
		const out = applyMoves(SOLUTION, [], fresh(), [
			{ x: 3, y: 0, action: 'fill' },
			{ x: -1, y: 0, action: 'fill' },
			{ x: 0.5, y: 0, action: 'fill' }
		]);
		expect(out).toEqual({ ...fresh(), wrong: [] });
	});

	it('does nothing once the game is over', () => {
		const done: PlayState = { playerGrid: {}, mistakes: 0, status: 'completed' };
		expect(applyMoves(SOLUTION, [], done, [{ x: 2, y: 0, action: 'fill' }]).mistakes).toBe(0);
	});
});

describe('hints and progress', () => {
	it('hints a correct, unfilled, unlocked cell from the row closest to done', () => {
		const grid = { '0,0': 'filled' as const }; // row 0 now needs just (1,0)
		expect(pickHintCell(SOLUTION, [], grid)).toEqual({ x: 1, y: 0 });
	});

	it('has no hint left on a solved board', () => {
		const grid = Object.fromEntries(
			['0,0', '1,0', '1,1', '1,2', '2,2'].map((k) => [k, 'filled' as const])
		);
		expect(isComplete(SOLUTION, [], grid)).toBe(true);
		expect(pickHintCell(SOLUTION, [], grid)).toBeNull();
	});

	it('reports progress over the picture cells only', () => {
		expect(progressOf(SOLUTION, [], {})).toBe(0);
		expect(progressOf(SOLUTION, [], { '0,0': 'filled', '2,0': 'marked' })).toBe(20);
	});
});
