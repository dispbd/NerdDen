/**
 * PixiJS Crossword Board renderer.
 *
 * Responsibilities:
 *  - Draw black (#) cells and white letter cells
 *  - Render clue numbers in the top-left corner of start cells
 *  - Display player-typed letters
 *  - Highlight the active cell + the full active word
 *  - Emit `cellSelect` events when clicking a white cell
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { CrosswordClue } from '$lib/games/crossword/types';

export interface CrosswordBoardOptions {
	/** Canvas width/height (shorter side — we scale proportionally) */
	size?: number;
}

export interface CrosswordCellSelectEvent {
	row: number;
	col: number;
}

type Handler<T> = (e: T) => void;

export class CrosswordBoard {
	private app: Application;
	private root = new Container();

	// State
	private grid: string[][] = []; // '#' or ''
	private playerGrid: Record<string, string> = {};
	private clues: CrosswordClue[] = [];
	private width = 0;
	private height = 0;

	private selectedRow = -1;
	private selectedCol = -1;
	/** Cells belonging to the currently active word */
	private activeWordCells = new Set<string>();
	/** Cell that starts a clue: key → clue number */
	private clueNumberMap = new Map<string, number>();

	private cellBgs: Graphics[][] = [];
	private letterTexts: (Text | null)[][] = [];
	private clueNumTexts: (Text | null)[][] = [];

	private cellSize = 0;
	private padding = 2;
	private initialized = false;

	// Event listeners
	private selectListeners: Handler<CrosswordCellSelectEvent>[] = [];

	constructor(_opts: CrosswordBoardOptions = {}) {
		void _opts;
		this.app = new Application();
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	async init(canvas: HTMLCanvasElement): Promise<void> {
		await this.app.init({
			canvas,
			width: canvas.clientWidth || 600,
			height: canvas.clientHeight || 600,
			backgroundColor: 0xece3d2,
			antialias: true,
			autoDensity: true,
			resolution: window.devicePixelRatio ?? 1
		});
		this.app.stage.addChild(this.root);
		this.initialized = true;
	}

	destroy(): void {
		this.app.destroy(false);
	}

	// ─── Public setters ───────────────────────────────────────────────────────

	/**
	 * Set the crossword layout. Call once after loading puzzle data.
	 * `grid` cells: '#' = black, '' = white (empty).
	 */
	setLayout(grid: string[][], clues: CrosswordClue[], width: number, height: number): void {
		this.grid = grid;
		this.clues = clues;
		this.width = width;
		this.height = height;
		this.buildClueNumberMap();
		this.recalcCellSize();
		this.buildCells();
	}

	/** Apply the player's current letter entries */
	setPlayerGrid(playerGrid: Record<string, string>): void {
		this.playerGrid = playerGrid;
		this.refreshLetters();
	}

	/** Highlight a specific cell (and the word it belongs to) */
	setSelectedCell(row: number, col: number, direction: 'across' | 'down'): void {
		this.selectedRow = row;
		this.selectedCol = col;
		this.computeActiveWordCells(row, col, direction);
		this.refreshHighlights();
	}

	// ─── Events ───────────────────────────────────────────────────────────────

	on(_event: 'cellSelect', handler: Handler<CrosswordCellSelectEvent>): void {
		this.selectListeners.push(handler);
	}

	private emit(row: number, col: number): void {
		for (const h of this.selectListeners) h({ row, col });
	}

	// ─── Private build helpers ────────────────────────────────────────────────

	private buildClueNumberMap(): void {
		this.clueNumberMap.clear();
		for (const clue of this.clues) {
			const key = `${clue.row},${clue.col}`;
			if (!this.clueNumberMap.has(key)) {
				this.clueNumberMap.set(key, clue.number);
			}
		}
	}

	private recalcCellSize(): void {
		if (!this.initialized) return;
		const { width: canvasW, height: canvasH } = this.app.screen;
		const maxCellW = (canvasW - this.padding * 2) / this.width;
		const maxCellH = (canvasH - this.padding * 2) / this.height;
		this.cellSize = Math.floor(Math.min(maxCellW, maxCellH));
	}

	private buildCells(): void {
		if (!this.initialized) return;

		this.root.removeChildren();
		this.cellBgs = [];
		this.letterTexts = [];
		this.clueNumTexts = [];

		const cs = this.cellSize;
		const pad = this.padding;

		for (let r = 0; r < this.height; r++) {
			this.cellBgs.push([]);
			this.letterTexts.push([]);
			this.clueNumTexts.push([]);

			for (let c = 0; c < this.width; c++) {
				const isBlack = this.grid[r]?.[c] === '#';
				const x = pad + c * cs;
				const y = pad + r * cs;

				const bg = new Graphics();
				if (isBlack) {
					bg.rect(x, y, cs, cs).fill(0x322c24);
				} else {
					bg.rect(x, y, cs, cs).fill(0xfbf8f1).stroke({ color: 0x322c24, width: 1 });

					bg.interactive = true;
					bg.cursor = 'pointer';
					const row = r;
					const col = c;
					bg.on('pointerdown', () => this.emit(row, col));
				}
				this.root.addChild(bg);
				this.cellBgs[r].push(bg);

				// Clue number
				const numText: Text | null = null;
				this.clueNumTexts[r].push(numText);
				if (!isBlack) {
					const num = this.clueNumberMap.get(`${r},${c}`);
					if (num !== undefined) {
						const t = new Text({
							text: String(num),
							style: new TextStyle({
								fontSize: Math.max(8, Math.floor(cs * 0.25)),
								fill: 0x6b6151,
								fontFamily: 'Hanken Grotesk, sans-serif'
							})
						});
						t.x = x + 2;
						t.y = y + 1;
						this.root.addChild(t);
						this.clueNumTexts[r][c] = t;
					}
				}

				// Letter
				if (!isBlack) {
					const lt = new Text({
						text: '',
						style: new TextStyle({
							fontSize: Math.max(12, Math.floor(cs * 0.55)),
							fill: 0x322c24,
							fontFamily: 'Caveat, cursive',
							fontWeight: 'bold'
						})
					});
					lt.anchor.set(0.5, 0.5);
					lt.x = x + cs / 2;
					lt.y = y + cs / 2;
					this.root.addChild(lt);
					this.letterTexts[r].push(lt);
				} else {
					this.letterTexts[r].push(null);
				}
			}
		}
	}

	private refreshLetters(): void {
		for (let r = 0; r < this.height; r++) {
			for (let c = 0; c < this.width; c++) {
				const lt = this.letterTexts[r]?.[c];
				if (!lt) continue;
				lt.text = this.playerGrid[`${r},${c}`] ?? '';
			}
		}
	}

	private refreshHighlights(): void {
		const cs = this.cellSize;
		const pad = this.padding;

		for (let r = 0; r < this.height; r++) {
			for (let c = 0; c < this.width; c++) {
				const bg = this.cellBgs[r]?.[c];
				if (!bg || this.grid[r]?.[c] === '#') continue;

				const x = pad + c * cs;
				const y = pad + r * cs;
				const isSelected = r === this.selectedRow && c === this.selectedCol;
				const isWord = this.activeWordCells.has(`${r},${c}`);

				const fillColor = isSelected ? 0xeccbb9 : isWord ? 0xdce6ef : 0xfbf8f1;

				bg.clear();
				bg.rect(x, y, cs, cs)
						.fill(fillColor)
						.stroke({ color: isSelected ? 0x3e5c76 : 0x322c24, width: isSelected ? 2.5 : 1 });
			}
		}
	}

	private computeActiveWordCells(
		row: number,
		col: number,
		direction: 'across' | 'down'
	): void {
		this.activeWordCells.clear();
		// Find the clue that starts at or before (row,col) in the given direction
		const clue = this.clues.find(
			(cl) =>
				cl.direction === direction &&
				((direction === 'across' &&
					cl.row === row &&
					cl.col <= col &&
					col < cl.col + cl.length) ||
					(direction === 'down' &&
						cl.col === col &&
						cl.row <= row &&
						row < cl.row + cl.length))
		);
		if (!clue) return;

		const dr = direction === 'down' ? 1 : 0;
		const dc = direction === 'across' ? 1 : 0;
		for (let i = 0; i < clue.length; i++) {
			this.activeWordCells.add(`${clue.row + dr * i},${clue.col + dc * i}`);
		}
	}

	resize(width: number, height: number): void {
		if (!this.initialized) return;
		this.app.renderer.resize(width, height);
		this.recalcCellSize();
		this.buildCells();
		this.refreshLetters();
		this.refreshHighlights();
	}
}
