/**
 * PixiJS Sudoku Board renderer.
 * Handles rendering, cell selection, digit display, and highlight state.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Grid, GridSize } from '$lib/games/sudoku/shared.js';
import { getBoxDim } from '$lib/games/sudoku/shared.js';
import { type BoardTheme, lightTheme } from './themes.js';
import { flashCell, pulseScale, playVictoryAnimation } from './animations.js';

export interface BoardOptions {
	size?: number; // canvas size in px (square)
	theme?: BoardTheme;
	gridSize?: GridSize;
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
	private hintCells: Set<string> = new Set();

	private selectedRow = -1;
	private selectedCol = -1;

	private theme: BoardTheme;
	private cellSize = 0;
	private padding = 4;
	private initialized = false;

	private gridSize: GridSize;
	private boxRows: number;
	private boxCols: number;

	private listeners: Map<string, Set<(e: unknown) => void>> = new Map();

	constructor(private options: BoardOptions = {}) {
		this.theme = options.theme ?? lightTheme;
		this.gridSize = options.gridSize ?? 9;
		const dim = getBoxDim(this.gridSize);
		this.boxRows = dim.rows;
		this.boxCols = dim.cols;
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

		this.cellSize = (size - this.padding * 2) / this.gridSize;
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
		this.hintCells.clear();
		this.selectedRow = -1;
		this.selectedCol = -1;
		if (this.initialized) this.renderAllCells();
	}

	/** Load an in-progress saved game — preserves player entries and distinguishes them from givens */
	loadState(puzzle: Grid, playerGrid: Grid, solution: Grid): void {
		this.puzzle = puzzle;
		this.solution = solution;
		this.playerGrid = playerGrid.map((row) => [...row]);
		this.errors.clear();
		this.hintCells.clear();
		this.selectedRow = -1;
		this.selectedCol = -1;
		if (this.initialized) {
			this.updateErrors();
			this.renderAllCells();
		}
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
		this.cellSize = (size - this.padding * 2) / this.gridSize;
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
			outer: for (let r = 0; r < this.gridSize; r++) {
				for (let c = 0; c < this.gridSize; c++) {
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
		this.hintCells.add(`${targetRow},${targetCol}`);
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

		// Grid lines first (bottom layer) so cell backgrounds render on top
		this.drawGridLines();

		for (let r = 0; r < this.gridSize; r++) {
			this.cellBgs[r] = [];
			this.digitTexts[r] = [];
			this.candidateContainers[r] = [];

			for (let c = 0; c < this.gridSize; c++) {
				// Cell background (above grid lines)
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
	}

	private drawGridLines(): void {
		const lines = new Graphics();
		const totalSize = this.cellSize * this.gridSize;

		for (let i = 0; i <= this.gridSize; i++) {
			const isHorizBoxBorder = i % this.boxRows === 0;
			const isVertBoxBorder = i % this.boxCols === 0;
			const pos = i * this.cellSize;

			// Vertical lines (separate columns)
			const vWidth = isVertBoxBorder ? (this.theme.gridLineThickWidth ?? 2.5) : (this.theme.gridLineWidth ?? 1);
			const vColor = isVertBoxBorder ? this.theme.gridLineThick : this.theme.gridLine;
			lines.moveTo(pos, 0).lineTo(pos, totalSize);
			lines.stroke({ color: vColor, width: vWidth });

			// Horizontal lines (separate rows)
			const hWidth = isHorizBoxBorder ? (this.theme.gridLineThickWidth ?? 2.5) : (this.theme.gridLineWidth ?? 1);
			const hColor = isHorizBoxBorder ? this.theme.gridLineThick : this.theme.gridLine;
			lines.moveTo(0, pos).lineTo(totalSize, pos);
			lines.stroke({ color: hColor, width: hWidth });
		}

		this.boardContainer.addChild(lines);
	}

	// ─── Rendering ────────────────────────────────────────────────

	private renderAllCells(): void {
		if (!this.initialized || !this.puzzle.length) return;
		for (let r = 0; r < this.gridSize; r++) {
			for (let c = 0; c < this.gridSize; c++) {
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

		// Inset cell background by half the relevant border width so it never covers grid lines
		const thinHalf = (this.theme.gridLineWidth ?? 1) / 2;
		const thickHalf = (this.theme.gridLineThickWidth ?? 2.5) / 2;
		const boxRows = this.boxRows;
		const boxCols = this.boxCols;
		const insetLeft   = c % boxCols === 0 ? thickHalf : thinHalf;
		const insetTop    = r % boxRows === 0 ? thickHalf : thinHalf;
		const insetRight  = (c + 1) % boxCols === 0 ? thickHalf : thinHalf;
		const insetBottom = (r + 1) % boxRows === 0 ? thickHalf : thinHalf;

		bg.clear();
		bg.rect(
			x + insetLeft,
			y + insetTop,
			this.cellSize - insetLeft - insetRight,
			this.cellSize - insetTop - insetBottom
		);
		bg.fill(color);
	}

	private renderHighlights(): void {
		for (let r = 0; r < this.gridSize; r++) {
			for (let c = 0; c < this.gridSize; c++) {
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
		const boxCols = this.gridSize / this.boxCols;
		const boxIndex = Math.floor(r / this.boxRows) * boxCols + Math.floor(c / this.boxCols);
		return boxIndex % 2 === 0 ? this.theme.cellBackground : this.theme.cellBackgroundAlt;
	}

	private isHighlighted(r: number, c: number): boolean {
		if (this.selectedRow < 0) return false;
		return (
			r === this.selectedRow ||
			c === this.selectedCol ||
			(Math.floor(r / this.boxRows) === Math.floor(this.selectedRow / this.boxRows) &&
				Math.floor(c / this.boxCols) === Math.floor(this.selectedCol / this.boxCols))
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
		const isHint = !isGiven && this.hintCells.has(`${r},${c}`);

		const color = isError
			? this.theme.digitError
			: isHint
				? (this.theme.digitHint ?? this.theme.digitPlayer)
				: isGiven
					? this.theme.digitGiven
					: this.theme.digitPlayer;

		const fontSize = Math.round(this.cellSize * (this.theme.digitScale ?? 0.56));
		const style = new TextStyle({
			fontFamily: this.theme.fontFamily ?? 'system-ui, sans-serif',
			fontSize,
			fontWeight: isGiven ? '700' : '400',
			fill: color,
			padding: Math.ceil(fontSize * 0.2) // prevent clipping of handwriting font descenders/ascenders
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
		for (let r = 0; r < this.gridSize; r++) {
			for (let c = 0; c < this.gridSize; c++) {
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
		for (let r = 0; r < this.gridSize; r++) {
			for (let c = 0; c < this.gridSize; c++) {
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
