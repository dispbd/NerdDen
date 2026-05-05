/**
 * PixiJS Sudoku Board renderer.
 * Handles rendering, cell selection, digit display, and highlight state.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Grid } from '$lib/server/games/sudoku/generator.js';
import { type BoardTheme, lightTheme } from './themes.js';
import { flashCell, pulseScale, playVictoryAnimation } from './animations.js';

export interface BoardOptions {
	size?: number; // canvas size in px (square)
	theme?: BoardTheme;
}

export interface CellSelectEvent {
	row: number;
	col: number;
}

export type BoardEventMap = {
	cellSelect: CellSelectEvent;
	solved: Record<string, never>;
};

export class SudokuBoard {
	private app: Application;
	private boardContainer = new Container();
	private cellBgs: Graphics[][] = [];
	private digitTexts: (Text | null)[][] = [];
	private candidateContainers: (Container | null)[][] = [];

	private puzzle: Grid = [];
	private playerGrid: Grid = [];
	private solution: Grid = [];
	private errors: Set<string> = new Set();

	private selectedRow = -1;
	private selectedCol = -1;

	private theme: BoardTheme;
	private cellSize = 0;
	private padding = 4;
	private initialized = false;

	private listeners: Map<string, Set<(e: unknown) => void>> = new Map();

	constructor(private options: BoardOptions = {}) {
		this.theme = options.theme ?? lightTheme;
		this.app = new Application();
	}

	async init(canvas: HTMLCanvasElement): Promise<void> {
		const size = (this.options.size ?? canvas.clientWidth) || 540;

		await this.app.init({
			canvas,
			width: size,
			height: size,
			backgroundColor: this.theme.background,
			antialias: true,
			resolution: window.devicePixelRatio || 1,
			autoDensity: true
		});

		this.cellSize = (size - this.padding * 2) / 9;
		this.app.stage.addChild(this.boardContainer);
		this.boardContainer.position.set(this.padding, this.padding);

		this.buildGrid();
		this.initialized = true;
	}

	// ─── Public API ───────────────────────────────────────────────

	/** Load puzzle and solution into the board */
	loadPuzzle(puzzle: Grid, solution: Grid): void {
		this.puzzle = puzzle;
		this.solution = solution;
		this.playerGrid = puzzle.map((row) => [...row]);
		this.errors.clear();
		this.selectedRow = -1;
		this.selectedCol = -1;
		if (this.initialized) this.renderAllCells();
	}

	/** Set a digit in the selected cell (0 = erase) */
	setDigit(num: number): void {
		const { selectedRow: r, selectedCol: c } = this;
		if (r < 0 || c < 0) return;
		if (this.puzzle[r][c] !== 0) return; // locked cell

		this.playerGrid[r][c] = num;
		this.updateCellDisplay(r, c);
		this.updateErrors();
		this.renderHighlights();
	}

	/** Select a cell programmatically */
	selectCell(row: number, col: number): void {
		this.selectedRow = row;
		this.selectedCol = col;
		this.renderHighlights();
		this.emit('cellSelect', { row, col });
	}

	/** Mark specific cells as errors */
	setErrors(errorCells: [number, number][]): void {
		this.errors = new Set(errorCells.map(([r, c]) => `${r},${c}`));
		this.renderAllCells();
	}

	/** Switch theme at runtime */
	setTheme(theme: BoardTheme): void {
		this.theme = theme;
		if (this.app.renderer) {
			this.app.renderer.background.color = theme.background;
		}
		this.renderAllCells();
	}

	/** Resize the board canvas */
	resize(size: number): void {
		this.app.renderer.resize(size, size);
		this.cellSize = (size - this.padding * 2) / 9;
		this.buildGrid();
		this.renderAllCells();
	}

	on<K extends keyof BoardEventMap>(event: K, handler: (e: BoardEventMap[K]) => void): void {
		if (!this.listeners.has(event)) this.listeners.set(event, new Set());
		this.listeners.get(event)!.add(handler as (e: unknown) => void);
	}

	off<K extends keyof BoardEventMap>(event: K, handler: (e: BoardEventMap[K]) => void): void {
		this.listeners.get(event)?.delete(handler as (e: unknown) => void);
	}

	destroy(): void {
		this.app.destroy();
	}

	/** Returns a deep copy of the current player grid for persistence */
	getPlayerGrid(): Grid {
		return this.playerGrid.map((row) => [...row]);
	}

	/**
	 * Reveal hint — places the correct digit in the selected cell,
	 * or the first empty cell if nothing is selected.
	 */
	revealHint(): void {
		if (!this.initialized || !this.puzzle.length) return;

		let targetRow = this.selectedRow;
		let targetCol = this.selectedCol;

		// If selected cell is already filled or nothing selected, find first empty
		if (targetRow < 0 || targetCol < 0 || this.playerGrid[targetRow][targetCol] !== 0) {
			outer: for (let r = 0; r < 9; r++) {
				for (let c = 0; c < 9; c++) {
					if (this.playerGrid[r][c] === 0) {
						targetRow = r;
						targetCol = c;
						break outer;
					}
				}
			}
		}

		if (targetRow < 0 || targetCol < 0) return; // board is full

		this.playerGrid[targetRow][targetCol] = this.solution[targetRow][targetCol];
		this.updateCellDisplay(targetRow, targetCol);
		this.updateErrors();
		this.renderHighlights();
		flashCell(
			this.app,
			this.boardContainer.x + targetCol * this.cellSize,
			this.boardContainer.y + targetRow * this.cellSize,
			this.cellSize,
			0x22c55e // green
		);
	}

	// ─── Build ────────────────────────────────────────────────────

	private buildGrid(): void {
		this.boardContainer.removeChildren();
		this.cellBgs = [];
		this.digitTexts = [];
		this.candidateContainers = [];

		for (let r = 0; r < 9; r++) {
			this.cellBgs[r] = [];
			this.digitTexts[r] = [];
			this.candidateContainers[r] = [];

			for (let c = 0; c < 9; c++) {
				// Cell background
				const bg = new Graphics();
				bg.eventMode = 'static';
				bg.cursor = 'pointer';
				bg.on('pointerdown', () => this.selectCell(r, c));
				this.boardContainer.addChild(bg);
				this.cellBgs[r][c] = bg;

				// Digit text (added on top of bg layer)
				this.digitTexts[r][c] = null;
				this.candidateContainers[r][c] = null;
			}
		}

		this.drawGridLines();
	}

	private drawGridLines(): void {
		const lines = new Graphics();
		const totalSize = this.cellSize * 9;

		for (let i = 0; i <= 9; i++) {
			const isBoxBorder = i % 3 === 0;
			const lineWidth = isBoxBorder ? 2.5 : 1;
			const color = isBoxBorder ? this.theme.gridLineThick : this.theme.gridLine;
			const pos = i * this.cellSize;

			lines.moveTo(pos, 0).lineTo(pos, totalSize);
			lines.moveTo(0, pos).lineTo(totalSize, pos);
			lines.stroke({ color, width: lineWidth });
		}

		this.boardContainer.addChild(lines);
	}

	// ─── Rendering ────────────────────────────────────────────────

	private renderAllCells(): void {
		if (!this.initialized || !this.puzzle.length) return;
		for (let r = 0; r < 9; r++) {
			for (let c = 0; c < 9; c++) {
				this.renderCell(r, c);
			}
		}
		this.renderHighlights();
	}

	private renderCell(r: number, c: number): void {
		this.updateCellBackground(r, c);
		this.updateCellDisplay(r, c);
	}

	private updateCellBackground(r: number, c: number): void {
		const bg = this.cellBgs[r][c];
		const color = this.getCellColor(r, c);
		const x = c * this.cellSize;
		const y = r * this.cellSize;

		bg.clear();
		bg.rect(x + 0.5, y + 0.5, this.cellSize - 1, this.cellSize - 1);
		bg.fill(color);
	}

	private renderHighlights(): void {
		for (let r = 0; r < 9; r++) {
			for (let c = 0; c < 9; c++) {
				this.updateCellBackground(r, c);
			}
		}
	}

	private getCellColor(r: number, c: number): number {
		const key = `${r},${c}`;
		if (r === this.selectedRow && c === this.selectedCol) return this.theme.cellSelected;
		if (this.isHighlighted(r, c)) return this.theme.cellHighlighted;
		if (this.errors.has(key)) return this.theme.cellError;
		if (this.puzzle.length && this.puzzle[r][c] !== 0) return this.theme.cellGiven;
		const boxIndex = Math.floor(r / 3) * 3 + Math.floor(c / 3);
		return boxIndex % 2 === 0 ? this.theme.cellBackground : this.theme.cellBackgroundAlt;
	}

	private isHighlighted(r: number, c: number): boolean {
		if (this.selectedRow < 0) return false;
		return (
			r === this.selectedRow ||
			c === this.selectedCol ||
			(Math.floor(r / 3) === Math.floor(this.selectedRow / 3) &&
				Math.floor(c / 3) === Math.floor(this.selectedCol / 3))
		);
	}

	private updateCellDisplay(r: number, c: number): void {
		// Remove existing text/candidates
		const existing = this.digitTexts[r][c];
		if (existing) {
			this.boardContainer.removeChild(existing);
			existing.destroy();
			this.digitTexts[r][c] = null;
		}
		const existingCands = this.candidateContainers[r][c];
		if (existingCands) {
			this.boardContainer.removeChild(existingCands);
			existingCands.destroy();
			this.candidateContainers[r][c] = null;
		}

		if (!this.playerGrid.length) return;
		const value = this.playerGrid[r][c];
		if (value === 0) return;

		const isGiven = this.puzzle[r][c] !== 0;
		const isError = this.errors.has(`${r},${c}`);

		const color = isError
			? this.theme.digitError
			: isGiven
				? this.theme.digitGiven
				: this.theme.digitPlayer;

		const fontSize = Math.round(this.cellSize * 0.56);
		const style = new TextStyle({
			fontFamily: 'system-ui, sans-serif',
			fontSize,
			fontWeight: isGiven ? '700' : '500',
			fill: color
		});

		const text = new Text({ text: String(value), style });
		text.anchor.set(0.5);
		text.position.set(
			c * this.cellSize + this.cellSize / 2,
			r * this.cellSize + this.cellSize / 2
		);

		this.boardContainer.addChild(text);
		this.digitTexts[r][c] = text;

		if (!isGiven) {
			pulseScale(this.app, text);
		}
	}

	private updateErrors(): void {
		const prevErrors = new Set(this.errors);
		const newErrors = new Set<string>();
		if (!this.solution.length) return;
		for (let r = 0; r < 9; r++) {
			for (let c = 0; c < 9; c++) {
				const v = this.playerGrid[r][c];
				if (v !== 0 && v !== this.solution[r][c]) {
					newErrors.add(`${r},${c}`);
				}
			}
		}
		this.errors = newErrors;

		// Flash newly errored cells
		for (const key of newErrors) {
			if (!prevErrors.has(key)) {
				const [r, c] = key.split(',').map(Number);
				flashCell(
					this.app,
					this.boardContainer.x + c * this.cellSize,
					this.boardContainer.y + r * this.cellSize,
					this.cellSize,
					0xff4444
				);
			}
		}

		// Check for victory
		if (newErrors.size === 0 && this.isBoardComplete()) {
			this.onSolved();
		}
	}

	private isBoardComplete(): boolean {
		for (let r = 0; r < 9; r++) {
			for (let c = 0; c < 9; c++) {
				if (this.playerGrid[r][c] === 0) return false;
			}
		}
		return true;
	}

	private onSolved(): void {
		playVictoryAnimation(this.app, this.boardContainer, this.cellSize, () => {
			this.emit('solved', {});
		});
	}

	// ─── Events ───────────────────────────────────────────────────

	private emit<K extends keyof BoardEventMap>(event: K, data: BoardEventMap[K]): void {
		this.listeners.get(event)?.forEach((fn) => fn(data));
	}
}
