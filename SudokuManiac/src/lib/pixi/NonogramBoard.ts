/**
 * PixiJS Nonogram board renderer.
 *
 * Draws the clue gutters and the playfield, and turns pointer strokes into moves.
 * It never decides game state: every paint is emitted, the page applies it (and the
 * server judges fills), and the result comes back through `setPlayerGrid`.
 *
 * Built standalone rather than on SudokuBoard (NONOGRAMS_PLAN.md §2). The decisions —
 * what a cell shows, what a stroke does, the geometry — live in
 * `$lib/games/nonogram/board.ts`, where they are tested; this file only draws.
 *
 * Object lifecycle: every Text and Graphics is created once per puzzle in `setPuzzle`
 * and only restyled or redrawn afterwards. Resizing re-lays them out in place.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { flashCell } from './animations';
import {
	cellAtPoint,
	cellView,
	displayClue,
	gutterSlots,
	layoutFor,
	lockAxis,
	revealMap,
	satisfiedLines,
	strokeActionFor,
	strokeCells,
	type BoardLayout,
	type Cell,
	type CellView,
	type Tool
} from '$lib/games/nonogram/board';
import type { Clue } from '$lib/games/nonogram/solver';
import {
	cellKey,
	type NonogramMove,
	type PlayerGrid,
	type Reveal
} from '$lib/games/nonogram/types';

/** Kraft Draft palette, from NerdDen Nonograms.dc.html. */
const C = {
	paper: 0xfbf8f1,
	gutter: 0xf1e9d9,
	gutterHover: 0xe6d9bf,
	cellHover: 0xefe7d4,
	ink: 0x322c24,
	clue: 0x6b6151,
	thinLine: 0xd8cfbb,
	marker: 0xb5462e,
	given: 0x8a8474,
	wrong: 0xb5462e,
	hint: 0xc29a45
};

/** Satisfied lines keep their clues readable, just quieter. */
const SATISFIED_ALPHA = 0.32;

interface Stroke {
	pointerId: number;
	anchor: Cell;
	axis: 'row' | 'col' | null;
	action: NonogramMove['action'];
	target: 'empty' | 'marked';
	touched: Set<string>;
}

type Handler<T> = (e: T) => void;

export class NonogramBoard {
	private app = new Application();
	private canvas: HTMLCanvasElement | null = null;
	private initialized = false;
	private destroyed = false;

	private root = new Container();
	private gutterBg = new Graphics();
	private clueLayer = new Container();
	private cellLayer = new Container();
	private lines = new Graphics();

	// Puzzle
	private n = 0;
	private rowClues: Clue[] = [];
	private colClues: Clue[] = [];
	private revealed = new Map<string, Reveal['state']>();
	private slots = { rowSlots: 1, colSlots: 1 };
	private maxCell = 30;

	// Player state
	private grid: PlayerGrid = {};
	private views: CellView[][] = [];
	private satisfied = { rows: [] as boolean[], cols: [] as boolean[] };

	// Display objects, created once per puzzle
	private cells: Graphics[][] = [];
	private rowTexts: Text[][] = [];
	private colTexts: Text[][] = [];

	private layout: BoardLayout | null = null;
	private tool: Tool = 'fill';
	private interactive = true;
	private hover: Cell | null = null;
	private stroke: Stroke | null = null;
	/** Set once the solved picture is shown: fills take this colour, crosses disappear. */
	private pictureColor: number | null = null;
	private ticks = new Set<() => void>();

	private paintListeners: Handler<NonogramMove>[] = [];
	private strokeEndListeners: Handler<void>[] = [];

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
		await this.app.init({
			canvas,
			width: Math.max(1, width),
			height: Math.max(1, height),
			backgroundColor: C.paper,
			antialias: true,
			autoDensity: true,
			resolution: window.devicePixelRatio ?? 1
		});
		// Unmounted while init was pending: nothing will call destroy() again.
		if (this.destroyed) {
			this.app.destroy(false, { children: true });
			return;
		}
		this.canvas = canvas;
		canvas.style.cursor = 'pointer';
		this.root.addChild(this.gutterBg, this.clueLayer, this.cellLayer, this.lines);
		this.app.stage.addChild(this.root);

		canvas.style.touchAction = 'none';
		canvas.addEventListener('pointerdown', this.onPointerDown);
		canvas.addEventListener('pointermove', this.onPointerMove);
		canvas.addEventListener('pointerup', this.onPointerUp);
		canvas.addEventListener('pointercancel', this.onPointerUp);
		canvas.addEventListener('pointerleave', this.onPointerLeave);
		canvas.addEventListener('contextmenu', this.onContextMenu);
		this.initialized = true;
		this.relayout();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		const c = this.canvas;
		if (c) {
			c.removeEventListener('pointerdown', this.onPointerDown);
			c.removeEventListener('pointermove', this.onPointerMove);
			c.removeEventListener('pointerup', this.onPointerUp);
			c.removeEventListener('pointercancel', this.onPointerUp);
			c.removeEventListener('pointerleave', this.onPointerLeave);
			c.removeEventListener('contextmenu', this.onContextMenu);
		}
		this.paintListeners = [];
		this.strokeEndListeners = [];
		if (this.initialized) {
			for (const t of this.ticks) this.app.ticker.remove(t);
			this.ticks.clear();
			// Keep the <canvas> (Svelte owns it); free everything drawn on it.
			this.app.destroy(false, { children: true });
		}
	}

	resize(width: number, height: number): void {
		if (!this.initialized || this.destroyed) return;
		this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
		this.relayout();
	}

	// ─── Public setters ───────────────────────────────────────────────────────

	/** Load a puzzle. Builds every display object; later updates only restyle them. */
	setPuzzle(rowClues: Clue[], colClues: Clue[], reveals: Reveal[], maxCell: number): void {
		this.n = rowClues.length;
		this.rowClues = rowClues;
		this.colClues = colClues;
		this.revealed = revealMap(reveals);
		this.slots = gutterSlots(rowClues, colClues);
		this.maxCell = maxCell;
		this.stroke = null;
		this.hover = null;
		this.pictureColor = null;
		this.layout = null;
		this.clueLayer.alpha = 1;

		for (const child of this.clueLayer.removeChildren()) child.destroy();
		for (const child of this.cellLayer.removeChildren()) child.destroy();

		const clueText = (value: number) =>
			new Text({
				text: String(value),
				style: {
					fontFamily: 'Hanken Grotesk, sans-serif',
					fontWeight: '700',
					fontSize: 12,
					fill: C.clue
				},
				anchor: 0.5
			});
		this.rowTexts = rowClues.map((clue) => displayClue(clue).map(clueText));
		this.colTexts = colClues.map((clue) => displayClue(clue).map(clueText));
		for (const t of [...this.rowTexts.flat(), ...this.colTexts.flat()]) this.clueLayer.addChild(t);

		this.cells = Array.from({ length: this.n }, () =>
			Array.from({ length: this.n }, () => this.cellLayer.addChild(new Graphics()))
		);
		this.views = [];
		this.refreshState(true);
		this.relayout();
	}

	setPlayerGrid(grid: PlayerGrid): void {
		this.grid = grid;
		this.refreshState(false);
	}

	setTool(tool: Tool): void {
		this.tool = tool;
	}

	/** Turn input off (game over) or back on. Ends any stroke in progress. */
	setInteractive(on: boolean): void {
		this.interactive = on;
		if (!on) {
			this.endStroke();
			this.setHover(null);
		}
		if (this.canvas) this.canvas.style.cursor = on ? 'pointer' : 'default';
	}

	// ─── Feedback ─────────────────────────────────────────────────────────────

	/** Flash cells the server judged wrong (they come back as crosses). */
	flashWrong(cells: readonly Cell[]): void {
		for (const c of cells) this.flash(c, C.wrong, 520);
	}

	/** Draw the eye to a cell a hint just filled. */
	flashHint(cell: Cell): void {
		this.flash(cell, C.hint, 900);
	}

	/**
	 * The solved picture: crosses vanish and fills turn the puzzle's colour in a
	 * diagonal sweep from the top-left, while the clues fade back.
	 */
	revealPicture(color: number, durationMs = 700): void {
		if (!this.initialized || this.destroyed) return;
		this.setInteractive(false);
		this.pictureColor = color;
		const n = this.n;
		const waves = 2 * n - 1;
		const done = new Set<number>();
		const start = performance.now();
		const tick = () => {
			const p = Math.min(1, (performance.now() - start) / durationMs);
			const reached = Math.floor(p * waves);
			for (let w = 0; w <= Math.min(reached, waves - 1); w++) {
				if (done.has(w)) continue;
				done.add(w);
				for (let x = Math.max(0, w - n + 1); x <= Math.min(w, n - 1); x++) this.drawCell(x, w - x);
			}
			this.clueLayer.alpha = 1 - 0.6 * p;
			if (p >= 1) this.untick(tick);
		};
		this.ticks.add(tick);
		this.app.ticker.add(tick);
	}

	// ─── Events ───────────────────────────────────────────────────────────────

	/** One move per cell a stroke changes, in stroke order. */
	onPaint(handler: Handler<NonogramMove>): void {
		this.paintListeners.push(handler);
	}

	/** The pointer was released: a good moment to send the batched moves. */
	onStrokeEnd(handler: Handler<void>): void {
		this.strokeEndListeners.push(handler);
	}

	// ─── State → display ──────────────────────────────────────────────────────

	/** Redraw only the cells whose view changed, and restyle the clue lines that flipped. */
	private refreshState(all: boolean): void {
		const n = this.n;
		const prevViews = this.views;
		this.views = Array.from({ length: n }, (_, y) =>
			Array.from({ length: n }, (_, x) => cellView(x, y, this.grid, this.revealed))
		);
		const prevSat = this.satisfied;
		this.satisfied = satisfiedLines(this.rowClues, this.colClues, this.grid, this.revealed);
		if (!this.layout) return;

		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				if (all || prevViews[y]?.[x] !== this.views[y][x]) this.drawCell(x, y);
			}
		}
		this.satisfied.rows.forEach((s, y) => {
			if (all || prevSat.rows[y] !== s)
				for (const t of this.rowTexts[y]) t.alpha = s ? SATISFIED_ALPHA : 1;
		});
		this.satisfied.cols.forEach((s, x) => {
			if (all || prevSat.cols[x] !== s)
				for (const t of this.colTexts[x]) t.alpha = s ? SATISFIED_ALPHA : 1;
		});
	}

	private relayout(): void {
		if (!this.initialized || this.destroyed || !this.n) return;
		const { width, height } = this.app.screen;
		const l = layoutFor(
			width,
			height,
			this.n,
			this.slots.rowSlots,
			this.slots.colSlots,
			this.maxCell
		);
		this.layout = l;
		this.root.position.set(l.originX, l.originY);

		// Row clues: right-aligned, so each row's last number sits next to its row.
		this.rowTexts.forEach((texts, y) => {
			const skip = this.slots.rowSlots - texts.length;
			texts.forEach((t, i) => {
				t.style.fontSize = l.font;
				t.position.set(2 + (skip + i + 0.5) * l.rowSlot, l.gutterH + (y + 0.5) * l.cell);
			});
		});
		// Column clues: bottom-aligned, so each column's last number sits on its column.
		this.colTexts.forEach((texts, x) => {
			const skip = this.slots.colSlots - texts.length;
			texts.forEach((t, i) => {
				t.style.fontSize = l.font;
				t.position.set(l.gutterW + (x + 0.5) * l.cell, 2 + (skip + i + 0.5) * l.colSlot);
			});
		});

		for (let y = 0; y < this.n; y++) {
			for (let x = 0; x < this.n; x++)
				this.cells[y][x].position.set(l.gutterW + x * l.cell, l.gutterH + y * l.cell);
		}
		this.refreshState(true);
		this.drawGutters();
		this.drawLines();
	}

	private drawGutters(): void {
		const l = this.layout;
		if (!l) return;
		const g = this.gutterBg.clear();
		const fieldW = this.n * l.cell;
		// The corner where the gutters meet stays paper: a notch, as in the mockup.
		g.rect(l.gutterW, 0, fieldW, l.gutterH).fill(C.gutter);
		g.rect(0, l.gutterH, l.gutterW, fieldW).fill(C.gutter);
		if (this.hover) {
			g.rect(l.gutterW + this.hover.x * l.cell, 0, l.cell, l.gutterH).fill(C.gutterHover);
			g.rect(0, l.gutterH + this.hover.y * l.cell, l.gutterW, l.cell).fill(C.gutterHover);
		}
	}

	/** Thin lines between cells, ink every 5th, ink where the field meets the gutters. */
	private drawLines(): void {
		const l = this.layout;
		if (!l) return;
		const g = this.lines.clear();
		const n = this.n;
		const x0 = l.gutterW;
		const y0 = l.gutterH;
		const span = n * l.cell;
		const heavy = (i: number) => (i + 1) % 5 === 0 && i !== n - 1;

		for (let i = 0; i < n - 1; i++) {
			if (heavy(i)) continue;
			const p = (i + 1) * l.cell;
			g.moveTo(x0 + p, y0).lineTo(x0 + p, y0 + span);
			g.moveTo(x0, y0 + p).lineTo(x0 + span, y0 + p);
		}
		g.stroke({ color: C.thinLine, width: 1 });

		for (let i = 0; i < n - 1; i++) {
			if (!heavy(i)) continue;
			const p = (i + 1) * l.cell;
			g.moveTo(x0 + p, y0).lineTo(x0 + p, y0 + span);
			g.moveTo(x0, y0 + p).lineTo(x0 + span, y0 + p);
		}
		g.moveTo(x0, 0).lineTo(x0, y0 + span);
		g.moveTo(0, y0).lineTo(x0 + span, y0);
		g.stroke({ color: C.ink, width: 2 });
	}

	private drawCell(x: number, y: number): void {
		const l = this.layout;
		const g = this.cells[y]?.[x];
		if (!l || !g) return;
		const s = l.cell;
		const view = this.views[y][x];
		const picture = this.pictureColor;
		g.clear();

		if (view === 'filled' || view === 'revealed-filled') {
			g.rect(0, 0, s, s).fill(picture ?? C.ink);
			// A given fill carries a small paper dot, so it reads as "not yours to change".
			if (view === 'revealed-filled' && picture === null)
				g.circle(s / 2, s / 2, Math.max(1.5, s * 0.09)).fill(C.paper);
			return;
		}

		const hovered = picture === null && this.hover?.x === x && this.hover?.y === y;
		g.rect(0, 0, s, s).fill(hovered ? C.cellHover : C.paper);
		if (picture !== null) return;
		if (view === 'marked') this.drawCross(g, s, C.marker);
		else if (view === 'revealed-empty') this.drawCross(g, s, C.given);
	}

	/** A hand-drawn-looking cross: two round-capped strokes, not a font glyph. */
	private drawCross(g: Graphics, s: number, color: number): void {
		const a = s * 0.28;
		const b = s - a;
		g.moveTo(a, a).lineTo(b, b).moveTo(b, a).lineTo(a, b);
		g.stroke({ color, width: Math.max(1.5, s * 0.085), cap: 'round' });
	}

	private flash(cell: Cell, color: number, ms: number): void {
		const l = this.layout;
		if (!l || this.destroyed) return;
		flashCell(
			this.app,
			l.originX + l.gutterW + cell.x * l.cell,
			l.originY + l.gutterH + cell.y * l.cell,
			l.cell,
			color,
			ms
		);
	}

	private untick(tick: () => void): void {
		this.app.ticker.remove(tick);
		this.ticks.delete(tick);
	}

	// ─── Input ────────────────────────────────────────────────────────────────

	private pointToCell(e: PointerEvent, clamp: boolean): Cell | null {
		if (!this.layout || !this.canvas) return null;
		const rect = this.canvas.getBoundingClientRect();
		return cellAtPoint(e.clientX - rect.left, e.clientY - rect.top, this.layout, this.n, clamp);
	}

	private onPointerDown = (e: PointerEvent): void => {
		if (!this.interactive || this.stroke) return;
		// Right button marks, whatever the tool — the usual desktop shortcut.
		if (e.button !== 0 && e.button !== 2) return;
		const cell = this.pointToCell(e, false);
		if (!cell) return;
		if (e.pointerType === 'mouse') this.setHover(cell);
		const tool: Tool = e.button === 2 ? 'mark' : this.tool;
		const decided = strokeActionFor(tool, this.views[cell.y][cell.x]);
		if (!decided) return;

		e.preventDefault();
		this.canvas?.setPointerCapture(e.pointerId);
		this.stroke = {
			pointerId: e.pointerId,
			anchor: cell,
			axis: null,
			touched: new Set(),
			...decided
		};
		this.paintCells([cell]);
	};

	private onPointerMove = (e: PointerEvent): void => {
		const s = this.stroke;
		if (!s) {
			if (this.interactive && e.pointerType === 'mouse') this.setHover(this.pointToCell(e, false));
			return;
		}
		if (e.pointerId !== s.pointerId) return;
		const cell = this.pointToCell(e, true);
		if (!cell) return;
		s.axis ??= lockAxis(s.anchor, cell);
		this.paintCells(strokeCells(s.anchor, cell, s.axis));
		if (e.pointerType === 'mouse') this.setHover(this.pointToCell(e, false));
	};

	private onPointerUp = (e: PointerEvent): void => {
		if (this.stroke && e.pointerId === this.stroke.pointerId) this.endStroke();
	};

	private onPointerLeave = (e: PointerEvent): void => {
		if (e.pointerType === 'mouse') this.setHover(null);
	};

	private onContextMenu = (e: Event): void => e.preventDefault();

	/** Emit a move for each cell not yet visited by this stroke that is still in the target state. */
	private paintCells(cells: readonly Cell[]): void {
		const s = this.stroke;
		if (!s) return;
		for (const c of cells) {
			const k = cellKey(c.x, c.y);
			if (s.touched.has(k)) continue;
			s.touched.add(k);
			if (this.views[c.y][c.x] !== s.target) continue;
			for (const h of this.paintListeners) h({ x: c.x, y: c.y, action: s.action });
		}
	}

	private endStroke(): void {
		const s = this.stroke;
		if (!s) return;
		this.stroke = null;
		if (this.canvas?.hasPointerCapture(s.pointerId)) this.canvas.releasePointerCapture(s.pointerId);
		for (const h of this.strokeEndListeners) h();
	}

	private setHover(cell: Cell | null): void {
		const prev = this.hover;
		if (prev?.x === cell?.x && prev?.y === cell?.y) return;
		this.hover = cell;
		if (prev) this.drawCell(prev.x, prev.y);
		if (cell) this.drawCell(cell.x, cell.y);
		this.drawGutters();
	}
}
