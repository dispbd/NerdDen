/**
 * Crossword grid builder.
 *
 * Algorithm (simple word-placement):
 * 1. Sort words longest-first.
 * 2. Place the first word horizontally in the centre.
 * 3. For each subsequent word, try every existing letter on the grid
 *    and every letter of the new word for an intersection.
 * 4. Pick the placement that maximises crossing count (most connected).
 * 5. After all placements, trim the bounding box and number the clues.
 */

import type {
	CrosswordClue,
	CrosswordGrid,
	Direction,
	PlacedWord,
	WordEntry
} from '$lib/games/crossword/types';

// ─── Internal helpers ─────────────────────────────────────────────────────────

const EMPTY = '.';
const BLACK = '#';

/** Allocate an empty grid */
function makeGrid(rows: number, cols: number): string[][] {
	return Array.from({ length: rows }, () => Array(cols).fill(EMPTY));
}

function canPlace(
	grid: string[][],
	word: string,
	row: number,
	col: number,
	dir: Direction
): boolean {
	const rows = grid.length;
	const cols = grid[0].length;
	const dr = dir === 'down' ? 1 : 0;
	const dc = dir === 'across' ? 1 : 0;

	// Check bounds
	const endRow = row + dr * (word.length - 1);
	const endCol = col + dc * (word.length - 1);
	if (endRow >= rows || endCol >= cols || row < 0 || col < 0) return false;

	// Check that cells before / after the word are empty or out-of-bounds
	const bRow = row - dr;
	const bCol = col - dc;
	if (bRow >= 0 && bCol >= 0 && grid[bRow][bCol] !== EMPTY) return false;
	const aRow = endRow + dr;
	const aCol = endCol + dc;
	if (aRow < rows && aCol < cols && grid[aRow][aCol] !== EMPTY) return false;

	// Check each letter
	for (let i = 0; i < word.length; i++) {
		const r = row + dr * i;
		const c = col + dc * i;
		const cell = grid[r][c];
		if (cell === EMPTY) {
			// Ensure no parallel adjacency
			const perpR = dir === 'across' ? r - 1 : r;
			const perpC = dir === 'down' ? c - 1 : c;
			const perpR2 = dir === 'across' ? r + 1 : r;
			const perpC2 = dir === 'down' ? c + 1 : c;
			if (
				(perpR >= 0 && grid[perpR][perpC] !== EMPTY) ||
				(perpR2 < rows && grid[perpR2][perpC2] !== EMPTY)
			)
				return false;
		} else if (cell !== word[i]) {
			return false;
		}
	}
	return true;
}

function placeWord(
	grid: string[][],
	word: string,
	row: number,
	col: number,
	dir: Direction
): void {
	const dr = dir === 'down' ? 1 : 0;
	const dc = dir === 'across' ? 1 : 0;
	for (let i = 0; i < word.length; i++) {
		grid[row + dr * i][col + dc * i] = word[i];
	}
}

/** Count how many cells overlap with existing letters */
function crossingScore(
	grid: string[][],
	word: string,
	row: number,
	col: number,
	dir: Direction
): number {
	const dr = dir === 'down' ? 1 : 0;
	const dc = dir === 'across' ? 1 : 0;
	let score = 0;
	for (let i = 0; i < word.length; i++) {
		if (grid[row + dr * i][col + dc * i] === word[i]) score++;
	}
	return score;
}

/** Bounding box of all non-empty cells */
function boundingBox(grid: string[][]): { minR: number; maxR: number; minC: number; maxC: number } {
	let minR = grid.length,
		maxR = 0,
		minC = grid[0].length,
		maxC = 0;
	for (let r = 0; r < grid.length; r++) {
		for (let c = 0; c < grid[0].length; c++) {
			if (grid[r][c] !== EMPTY) {
				if (r < minR) minR = r;
				if (r > maxR) maxR = r;
				if (c < minC) minC = c;
				if (c > maxC) maxC = c;
			}
		}
	}
	return { minR, maxR, minC, maxC };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface BuildResult {
	grid: CrosswordGrid;
	clues: CrosswordClue[];
	width: number;
	height: number;
}

/**
 * Build a crossword grid from a list of words with clues.
 * Returns the trimmed grid and numbered clue list.
 * Words that cannot be placed are silently skipped.
 */
export function buildCrossword(entries: WordEntry[], maxSize = 21): BuildResult {
	const words = entries
		.map((e) => ({ ...e, word: e.word.toUpperCase() }))
		.sort((a, b) => b.word.length - a.word.length);

	if (words.length === 0) {
		return { grid: [['#']], clues: [], width: 1, height: 1 };
	}

	// Work on an oversized scratch grid
	const SIZE = maxSize * 2 + 10;
	const CENTER = Math.floor(SIZE / 2);
	const scratch = makeGrid(SIZE, SIZE);

	const placed: PlacedWord[] = [];

	// Place the first word across through the centre
	const first = words[0];
	const startCol = CENTER - Math.floor(first.word.length / 2);
	placeWord(scratch, first.word, CENTER, startCol, 'across');
	placed.push({ ...first, row: CENTER, col: startCol, direction: 'across' });

	// Place subsequent words
	for (let wi = 1; wi < words.length; wi++) {
		const entry = words[wi];
		let bestScore = -1;
		let best: { row: number; col: number; dir: Direction } | null = null;

		// Try each direction
		for (const dir of ['across', 'down'] as Direction[]) {
			const dr = dir === 'down' ? 1 : 0;
			const dc = dir === 'across' ? 1 : 0;

			// Try to intersect with each placed word's letters
			for (const pw of placed) {
				// Skip same direction (avoid parallel runs)
				if (pw.direction === dir) continue;

				const pwDr = pw.direction === 'down' ? 1 : 0;
				const pwDc = pw.direction === 'across' ? 1 : 0;

				for (let pi = 0; pi < pw.word.length; pi++) {
					const letter = pw.word[pi];
					const pr = pw.row + pwDr * pi;
					const pc = pw.col + pwDc * pi;

					// Find positions in the new word that match this letter
					for (let ni = 0; ni < entry.word.length; ni++) {
						if (entry.word[ni] !== letter) continue;
						const row = pr - dr * ni;
						const col = pc - dc * ni;
						if (canPlace(scratch, entry.word, row, col, dir)) {
							const score = crossingScore(scratch, entry.word, row, col, dir);
							if (score > bestScore) {
								bestScore = score;
								best = { row, col, dir };
							}
						}
					}
				}
			}
		}

		if (best && bestScore > 0) {
			placeWord(scratch, entry.word, best.row, best.col, best.dir);
			placed.push({ ...entry, row: best.row, col: best.col, direction: best.dir });
		}
	}

	// Trim bounding box + 1 cell padding
	const { minR, maxR, minC, maxC } = boundingBox(scratch);
	const padR = minR > 0 ? 1 : 0;
	const padC = minC > 0 ? 1 : 0;
	const height = maxR - minR + 1 + padR * 2;
	const width = maxC - minC + 1 + padC * 2;

	const grid: CrosswordGrid = Array.from({ length: height }, (_, r) =>
		Array.from({ length: width }, (_, c) => {
			const val = scratch[minR - padR + r][minC - padC + c];
			return val === EMPTY ? BLACK : val;
		})
	);

	// Adjust placed word coordinates relative to trimmed grid
	const offsetR = minR - padR;
	const offsetC = minC - padC;
	const adjustedPlaced = placed.map((pw) => ({
		...pw,
		row: pw.row - offsetR,
		col: pw.col - offsetC
	}));

	// Number clues (top-left, row-major)
	const needsNumber = new Set<string>();
	for (const pw of adjustedPlaced) {
		needsNumber.add(`${pw.row},${pw.col}`);
	}

	// Sort cells top-left → bottom-right
	const cellNumbers = new Map<string, number>();
	let num = 1;
	for (let r = 0; r < height; r++) {
		for (let c = 0; c < width; c++) {
			const key = `${r},${c}`;
			if (needsNumber.has(key)) {
				cellNumbers.set(key, num++);
			}
		}
	}

	const clues: CrosswordClue[] = adjustedPlaced.map((pw) => ({
		number: cellNumbers.get(`${pw.row},${pw.col}`) ?? 0,
		direction: pw.direction,
		clue: pw.clue,
		answer: pw.word,
		row: pw.row,
		col: pw.col,
		length: pw.word.length
	}));

	clues.sort((a, b) => a.number - b.number || (a.direction === 'across' ? -1 : 1));

	return { grid, clues, width, height };
}
