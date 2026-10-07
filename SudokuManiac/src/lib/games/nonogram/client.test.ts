import { describe, expect, it } from 'vitest';
import {
	applyOptimistic,
	catTip,
	formatTime,
	gradeFor,
	NonogramSync,
	undoMoves,
	type PlayResult,
	type SessionView
} from './client';
import { computeClues } from './solver';
import type { NonogramMove, PlayerGrid } from './types';

const session = (playerGrid: PlayerGrid, extra: Partial<SessionView> = {}): SessionView => ({
	id: 's1',
	nonogramId: 'n1',
	status: 'in_progress',
	playerGrid,
	mistakes: 0,
	hintsUsed: 0,
	hintsLeft: 3,
	timeSpent: 0,
	...extra
});

/** A transport whose requests the test resolves by hand, in any order it likes. */
function manualTransport() {
	const calls: {
		kind: 'moves' | 'hint';
		moves?: NonogramMove[];
		resolve: (r: PlayResult) => void;
		reject: (e: unknown) => void;
	}[] = [];
	return {
		calls,
		transport: {
			moves: (moves: NonogramMove[]) =>
				new Promise<PlayResult>((resolve, reject) =>
					calls.push({ kind: 'moves', moves: [...moves], resolve, reject })
				),
			hint: () =>
				new Promise<PlayResult>((resolve, reject) => calls.push({ kind: 'hint', resolve, reject }))
		}
	};
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('applyOptimistic', () => {
	it('mirrors the server rules without judging fills', () => {
		const locked = new Set(['0,0']);
		const grid = applyOptimistic(
			{ '1,0': 'filled', '2,0': 'marked' },
			[
				{ x: 0, y: 0, action: 'fill' }, // locked: ignored
				{ x: 1, y: 0, action: 'mark' }, // a fill can't be crossed out
				{ x: 2, y: 0, action: 'clear' },
				{ x: 3, y: 0, action: 'fill' }
			],
			locked
		);
		expect(grid).toEqual({ '1,0': 'filled', '3,0': 'filled' });
	});
});

describe('NonogramSync', () => {
	it('shows moves at once and replaces them with the server’s verdict', async () => {
		const { calls, transport } = manualTransport();
		const shown: PlayerGrid[] = [];
		const results: PlayResult[] = [];
		const sync = new NonogramSync(
			{},
			[],
			transport,
			(g) => shown.push(g),
			(r) => results.push(r)
		);

		sync.paint({ x: 0, y: 0, action: 'fill' });
		expect(sync.grid).toEqual({ '0,0': 'filled' });

		const done = sync.flush();
		await tick();
		expect(calls).toHaveLength(1);
		// Wrong fill: the server turns it into a cross.
		calls[0].resolve({
			session: session({ '0,0': 'marked' }, { mistakes: 1 }),
			wrong: [{ x: 0, y: 0 }],
			xpEarned: 0,
			solution: null
		});
		await done;
		expect(sync.grid).toEqual({ '0,0': 'marked' });
		expect(results[0].wrong).toEqual([{ x: 0, y: 0 }]);
		expect(sync.busy).toBe(false);
	});

	it('keeps cells painted while a request was in flight', async () => {
		const { calls, transport } = manualTransport();
		const sync = new NonogramSync(
			{},
			[],
			transport,
			() => {},
			() => {}
		);

		sync.paint({ x: 0, y: 0, action: 'fill' });
		const first = sync.flush();
		await tick();
		sync.paint({ x: 1, y: 0, action: 'mark' }); // painted during the request
		const second = sync.flush();

		calls[0].resolve({ session: session({ '0,0': 'filled' }), xpEarned: 0, solution: null });
		await first;
		// The response did not wipe the newer cross.
		expect(sync.grid).toEqual({ '0,0': 'filled', '1,0': 'marked' });

		await tick();
		expect(calls).toHaveLength(2); // one request at a time, in order
		expect(calls[1].moves).toEqual([{ x: 1, y: 0, action: 'mark' }]);
		calls[1].resolve({
			session: session({ '0,0': 'filled', '1,0': 'marked' }),
			xpEarned: 0,
			solution: null
		});
		await second;
		expect(sync.busy).toBe(false);
	});

	it('keeps failed moves and resends them, in order, with the next flush', async () => {
		const { calls, transport } = manualTransport();
		const sync = new NonogramSync(
			{},
			[],
			transport,
			() => {},
			() => {}
		);

		sync.paint({ x: 0, y: 0, action: 'fill' });
		const first = sync.flush();
		await tick();
		calls[0].reject(new Error('offline'));
		await first;
		expect(sync.offline).toBe(true);
		expect(sync.grid).toEqual({ '0,0': 'filled' }); // still shown

		sync.paint({ x: 1, y: 0, action: 'fill' });
		const second = sync.flush();
		await tick();
		expect(calls[1].moves).toEqual([
			{ x: 0, y: 0, action: 'fill' },
			{ x: 1, y: 0, action: 'fill' }
		]);
		calls[1].resolve({
			session: session({ '0,0': 'filled', '1,0': 'filled' }),
			xpEarned: 0,
			solution: null
		});
		await second;
		expect(sync.offline).toBe(false);
	});

	it('sends pending moves before asking for a hint', async () => {
		const { calls, transport } = manualTransport();
		const sync = new NonogramSync(
			{},
			[],
			transport,
			() => {},
			() => {}
		);

		sync.paint({ x: 2, y: 2, action: 'mark' });
		const h = sync.hint();
		await tick();
		expect(calls.map((c) => c.kind)).toEqual(['moves']);
		calls[0].resolve({ session: session({ '2,2': 'marked' }), xpEarned: 0, solution: null });
		await tick();
		expect(calls.map((c) => c.kind)).toEqual(['moves', 'hint']);
		calls[1].resolve({
			session: session({ '2,2': 'marked', '0,0': 'filled' }, { hintsUsed: 1 }),
			cell: { x: 0, y: 0 },
			xpEarned: 0,
			solution: null
		});
		await h;
		expect(sync.grid).toEqual({ '2,2': 'marked', '0,0': 'filled' });
	});

	it('never moves a revealed cell, even optimistically', () => {
		const { transport } = manualTransport();
		const sync = new NonogramSync(
			{},
			[{ x: 0, y: 0, state: 'empty' }],
			transport,
			() => {},
			() => {}
		);
		sync.paint({ x: 0, y: 0, action: 'fill' });
		expect(sync.grid).toEqual({});
	});
});

describe('undoMoves', () => {
	it('restores what each cell held, last cell first', () => {
		const moves = undoMoves(
			[
				{ move: { x: 0, y: 0, action: 'fill' }, before: undefined },
				{ move: { x: 1, y: 0, action: 'mark' }, before: undefined },
				{ move: { x: 2, y: 0, action: 'clear' }, before: 'marked' }
			],
			{ '0,0': 'filled', '1,0': 'marked' }
		);
		expect(moves).toEqual([
			{ x: 2, y: 0, action: 'mark' },
			{ x: 1, y: 0, action: 'clear' },
			{ x: 0, y: 0, action: 'clear' }
		]);
	});

	it('leaves the cross of a wrong fill: the mistake is already counted', () => {
		const moves = undoMoves([{ move: { x: 3, y: 1, action: 'fill' }, before: undefined }], {
			'3,1': 'marked'
		});
		expect(moves).toEqual([]);
	});

	it('skips cells that already hold their old value', () => {
		expect(undoMoves([{ move: { x: 0, y: 0, action: 'mark' }, before: undefined }], {})).toEqual(
			[]
		);
	});
});

describe('catTip', () => {
	const rows = (pic: string[]) =>
		computeClues(pic.map((r) => [...r].map((c) => (c === '#' ? 1 : 0))));

	it('points at a line its clue fills exactly', () => {
		const { rowClues, colClues } = rows(['#####', '#...#', '.....', '#....', '.#...']);
		expect(catTip(rowClues, colClues, {}, [])).toEqual({ kind: 'full', axis: 'row', line: 1 });
	});

	it('explains the overlap when no line is exact', () => {
		// Row 1 is "4" in 5 cells: slack 1, so the middle 3 are sure.
		const { rowClues, colClues } = rows(['####.', '.....', '#....', '.....', '..#..']);
		expect(catTip(rowClues, colClues, {}, [])).toEqual({
			kind: 'overlap',
			axis: 'row',
			line: 1,
			block: 4,
			sure: 3
		});
	});

	it('moves on once a line is done', () => {
		const { rowClues, colClues } = rows(['#####', '.....', '#....', '.....', '..#..']);
		const grid: PlayerGrid = {
			'0,0': 'filled',
			'1,0': 'filled',
			'2,0': 'filled',
			'3,0': 'filled',
			'4,0': 'filled'
		};
		expect(catTip(rowClues, colClues, grid, [])).not.toMatchObject({ axis: 'row', line: 1 });
	});

	it('suggests crossing out a "0" line when nothing else is certain', () => {
		const { rowClues, colClues } = rows(['#....', '.....', '..#..', '.....', '....#']);
		expect(catTip(rowClues, colClues, {}, [])).toMatchObject({ kind: 'empty' });
		const crossed: PlayerGrid = {};
		for (let x = 0; x < 5; x++) {
			crossed[`${x},1`] = 'marked';
			crossed[`${x},3`] = 'marked';
			crossed[`1,${x}`] = 'marked';
			crossed[`3,${x}`] = 'marked';
		}
		expect(catTip(rowClues, colClues, crossed, [])).toEqual({ kind: 'edges' });
	});
});

describe('grade and time', () => {
	it('grades by mistakes, and a hint costs the plus', () => {
		expect(gradeFor(0, 0)).toBe('A+');
		expect(gradeFor(0, 2)).toBe('A');
		expect(gradeFor(1, 0)).toBe('B');
		expect(gradeFor(2, 3)).toBe('C');
	});

	it('formats mm:ss', () => {
		expect(formatTime(0)).toBe('00:00');
		expect(formatTime(347)).toBe('05:47');
		expect(formatTime(3725)).toBe('62:05');
	});
});
