/**
 * Builds a hints golden set: boards from the production generator at different
 * stages of play, each with its solution and every single (logical next move).
 *
 *   npx tsx evals/hints/build-dataset.ts                      # main set: datasets/hints.json
 *   npx tsx evals/hints/build-dataset.ts --out evals/datasets/hints-hard.json --seed 7 \
 *       --difficulties expert,extreme --stages 0,0.4 --max-singles 3 --prefix x   # hard set
 *
 * Deterministic: Math.random is replaced by a seeded PRNG, so the same seed gives
 * the same boards. Boards without any single are skipped — on them the "next
 * logical move" needs advanced techniques and has no objective answer to check.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { generatePuzzle } from '../../src/lib/games/sudoku/generator.ts';
import type { Difficulty } from '../../src/lib/games/sudoku/shared.ts';
import { findSingles } from './sudoku.ts';
import type { HintCase } from './types.ts';

export type { HintCase } from './types.ts';

const { values: args } = parseArgs({
	options: {
		count: { type: 'string', default: '30' },
		seed: { type: 'string', default: '42' },
		difficulties: { type: 'string', default: 'easy,medium,hard' },
		stages: { type: 'string', default: '0,0.4,0.75' },
		/** Keep only boards with at most this many singles: fewer moves to find, harder to spot one. */
		'max-singles': { type: 'string' },
		prefix: { type: 'string', default: 'h' },
		out: { type: 'string', default: 'evals/datasets/hints.json' }
	}
});
const count = Number(args.count);
const seed = Number(args.seed);
const maxSingles = args['max-singles'] ? Number(args['max-singles']) : Infinity;
const DIFFICULTIES = args.difficulties!.split(',') as Difficulty[];
const STAGES = args.stages!.split(',').map(Number);
if (!(count > 0) || !Number.isFinite(seed)) throw new Error('--count and --seed must be numbers');

// mulberry32
let s = seed >>> 0;
Math.random = () => {
	s = (s + 0x6d2b79f5) >>> 0;
	let t = s;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const cases: HintCase[] = [];
let skipped = 0;
while (cases.length < count) {
	const difficulty = DIFFICULTIES[cases.length % DIFFICULTIES.length];
	const stage = STAGES[Math.floor(cases.length / DIFFICULTIES.length) % STAGES.length];
	const { puzzle, solution } = generatePuzzle(difficulty, 9);

	// Simulate progress: fill a share of the empty cells with correct digits.
	const playerGrid = puzzle.map((row) => [...row]);
	const empty = puzzle.flatMap((row, r) => row.flatMap((v, c) => (v === 0 ? [[r, c]] : [])));
	empty.sort(() => Math.random() - 0.5);
	for (const [r, c] of empty.slice(0, Math.round(empty.length * stage))) playerGrid[r][c] = solution[r][c];

	const singles = findSingles(playerGrid);
	if (!singles.length || singles.length > maxSingles) {
		skipped++;
		continue;
	}
	cases.push({
		id: `${args.prefix}${String(cases.length + 1).padStart(2, '0')}-${difficulty}-${Math.round(stage * 100)}`,
		difficulty,
		stage,
		puzzle,
		playerGrid,
		solution,
		singles
	});
}

mkdirSync('evals/datasets', { recursive: true });
writeFileSync(args.out!, JSON.stringify({ seed, cases }, null, '\t') + '\n');
console.log(`wrote ${cases.length} cases to ${args.out} (skipped ${skipped} boards: no singles or more than ${maxSingles})`);
