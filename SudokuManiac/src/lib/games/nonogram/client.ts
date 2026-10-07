/**
 * Client-side play logic: keeping the board in step with the server, Undo, the
 * Cat's tip and the end-of-game grade. No DOM, no Svelte, so it is unit-tested.
 */

import { revealMap, satisfiedLines } from './board';
import type { Clue } from './solver';
import { cellKey, type NonogramMove, type PlayerGrid, type Reveal } from './types';

// ─── Optimistic moves ────────────────────────────────────────────────────────

/**
 * Apply moves the way the server will, minus the judgement: a fill shows as filled
 * until the server says otherwise. Mirrors applyMoves in server/games/nonogram/play.ts.
 */
export function applyOptimistic(
	grid: PlayerGrid,
	moves: readonly NonogramMove[],
	locked: ReadonlySet<string>
): PlayerGrid {
	if (!moves.length) return grid;
	const out: PlayerGrid = { ...grid };
	for (const m of moves) {
		const k = cellKey(m.x, m.y);
		if (locked.has(k)) continue;
		if (m.action === 'fill') out[k] = 'filled';
		else if (m.action === 'mark') {
			if (out[k] !== 'filled') out[k] = 'marked';
		} else delete out[k];
	}
	return out;
}

export interface SessionView {
	id: string;
	nonogramId: string;
	status: 'in_progress' | 'completed' | 'failed';
	playerGrid: PlayerGrid;
	mistakes: number;
	hintsUsed: number;
	hintsLeft: number;
	timeSpent: number;
}

/** What the moves and hint endpoints return. */
export interface PlayResult {
	session: SessionView;
	/** Fills the server judged wrong (moves only) */
	wrong?: { x: number; y: number }[];
	/** The cell a hint filled (hints only) */
	cell?: { x: number; y: number } | null;
	xpEarned: number;
	/** Picture rows, once the game is over */
	solution: string[] | null;
}

export interface SyncTransport {
	moves(moves: NonogramMove[]): Promise<PlayResult>;
	hint(): Promise<PlayResult>;
}

/**
 * Keeps the board responsive while the server judges every fill.
 *
 * Moves show at once (optimistically) and are sent in batches, one request at a time.
 * The grid shown is always: the last grid the server confirmed, plus the moves in
 * flight, plus the moves not yet sent — so a response never wipes out cells painted
 * while it was on the way. Hints run through the same queue, after any moves before
 * them, so the two never race.
 */
export class NonogramSync {
	private confirmed: PlayerGrid;
	private sent: NonogramMove[] = [];
	private pending: NonogramMove[] = [];
	private chain: Promise<unknown> = Promise.resolve();
	private readonly locked: Set<string>;
	/** The last request failed; its moves are kept and go out with the next flush. */
	offline = false;

	constructor(
		initial: PlayerGrid,
		reveals: readonly Reveal[],
		private readonly transport: SyncTransport,
		private readonly onChange: (grid: PlayerGrid) => void,
		private readonly onResult: (result: PlayResult) => void
	) {
		this.confirmed = initial;
		this.locked = new Set(reveals.map((r) => cellKey(r.x, r.y)));
	}

	/** The grid to draw. */
	get grid(): PlayerGrid {
		return applyOptimistic(
			applyOptimistic(this.confirmed, this.sent, this.locked),
			this.pending,
			this.locked
		);
	}

	/** True while anything is unsent or unconfirmed. */
	get busy(): boolean {
		return this.sent.length > 0 || this.pending.length > 0;
	}

	paint(move: NonogramMove): void {
		this.pending.push(move);
		this.onChange(this.grid);
	}

	/** Send everything painted so far. Resolves once the server has answered. */
	flush(): Promise<void> {
		return this.enqueue(() => this.sendPending());
	}

	/** Ask for a hint, after any moves painted before it. */
	hint(): Promise<void> {
		return this.enqueue(async () => {
			if (!(await this.sendPending())) return;
			try {
				const res = await this.transport.hint();
				this.confirmed = res.session.playerGrid;
				this.offline = false;
				this.onChange(this.grid);
				this.onResult(res);
			} catch {
				this.offline = true;
				this.onChange(this.grid);
			}
		});
	}

	private enqueue(task: () => Promise<unknown>): Promise<void> {
		const run = this.chain.then(task, task);
		this.chain = run.catch(() => {});
		return run.then(() => {});
	}

	/** Returns false if the request failed (moves are kept for the next try). */
	private async sendPending(): Promise<boolean> {
		if (!this.pending.length) return true;
		this.sent = this.pending;
		this.pending = [];
		try {
			const res = await this.transport.moves(this.sent);
			this.confirmed = res.session.playerGrid;
			this.sent = [];
			this.offline = false;
			this.onChange(this.grid);
			this.onResult(res);
			return true;
		} catch {
			// Keep the moves, in order, ahead of anything painted meanwhile.
			this.pending = [...this.sent, ...this.pending];
			this.sent = [];
			this.offline = true;
			this.onChange(this.grid);
			return false;
		}
	}
}

// ─── Undo ────────────────────────────────────────────────────────────────────

/** One painted cell and what it held before, recorded as the stroke happens. */
export interface StrokeEntry {
	move: NonogramMove;
	before: PlayerGrid[string] | undefined;
}

/**
 * Moves that take a stroke back. A fill the server judged wrong (now a cross) stays:
 * the mistake was counted, and the cross is true information.
 */
export function undoMoves(stroke: readonly StrokeEntry[], grid: PlayerGrid): NonogramMove[] {
	const out: NonogramMove[] = [];
	for (const { move, before } of [...stroke].reverse()) {
		const { x, y } = move;
		const now = grid[cellKey(x, y)];
		if (move.action === 'fill' && now === 'marked') continue;
		if (now === before) continue;
		if (before === undefined) out.push({ x, y, action: 'clear' });
		else if (before === 'marked') out.push({ x, y, action: 'mark' });
		else out.push({ x, y, action: 'fill' });
	}
	return out;
}

// ─── The Cat's tip ───────────────────────────────────────────────────────────

export type CatTip =
	| { kind: 'full'; axis: 'row' | 'col'; line: number }
	| { kind: 'overlap'; axis: 'row' | 'col'; line: number; block: number; sure: number }
	| { kind: 'empty'; axis: 'row' | 'col'; line: number }
	| { kind: 'edges' };

/**
 * A tip for the line where simple logic gives the most right now, skipping lines
 * already done. `line` is 1-based, ready to show.
 *
 * - full: the clue plus its gaps fills the line exactly.
 * - overlap: a block longer than the line's slack has cells that are filled
 *   wherever the block slides.
 * - empty: a "0" line is all crosses.
 */
export function catTip(
	rowClues: readonly Clue[],
	colClues: readonly Clue[],
	grid: PlayerGrid,
	reveals: readonly Reveal[]
): CatTip {
	const n = rowClues.length;
	const revealed = revealMap(reveals);
	const done = satisfiedLines(rowClues, colClues, grid, revealed);

	let best: CatTip | null = null;
	let bestGain = 0;
	let empty: CatTip | null = null;

	const lines = [
		...rowClues.map((clue, i) => ({ axis: 'row' as const, i, clue, done: done.rows[i] })),
		...colClues.map((clue, i) => ({ axis: 'col' as const, i, clue, done: done.cols[i] }))
	];
	for (const { axis, i, clue, done: isDone } of lines) {
		if (!clue.length) {
			// A "0" line is satisfied from the start; it is only "done" once crossed out.
			const cells = Array.from({ length: n }, (_, j) =>
				axis === 'row' ? cellKey(j, i) : cellKey(i, j)
			);
			const crossed = cells.every((k) => grid[k] === 'marked' || revealed.get(k) === 'empty');
			if (!crossed && !empty) empty = { kind: 'empty', axis, line: i + 1 };
			continue;
		}
		if (isDone) continue;
		const slack = n - (clue.reduce((a, b) => a + b, 0) + clue.length - 1);
		if (slack === 0) {
			if (n > bestGain) {
				bestGain = n;
				best = { kind: 'full', axis, line: i + 1 };
			}
			continue;
		}
		const block = Math.max(...clue);
		const sure = clue.reduce((s, b) => s + Math.max(0, b - slack), 0);
		if (block > slack && sure > bestGain) {
			bestGain = sure;
			best = { kind: 'overlap', axis, line: i + 1, block, sure: block - slack };
		}
	}
	if (best) return best;
	return empty ?? { kind: 'edges' };
}

// ─── Grade ───────────────────────────────────────────────────────────────────

/** Victory grade: clean runs earn the A+, every mistake costs a letter. */
export function gradeFor(mistakes: number, hintsUsed: number): 'A+' | 'A' | 'B' | 'C' {
	if (mistakes <= 0) return hintsUsed > 0 ? 'A' : 'A+';
	return mistakes === 1 ? 'B' : 'C';
}

export function formatTime(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	const mm = Math.floor(s / 60);
	return `${String(mm).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
