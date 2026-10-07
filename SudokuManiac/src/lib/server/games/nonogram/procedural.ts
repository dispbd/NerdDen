/**
 * Procedural nonograms — the last-resort fallback (NONOGRAMS_PLAN.md §5).
 *
 * Unions of a few ellipses/rectangles, sometimes with a hole cut out, run through the
 * same pipeline as AI drawings. Deterministic for a given seed string, so seeding by
 * date yields a daily puzzle for free. These are shapes, not pictures: callers label
 * them honestly ("Mystery shape"), never with a borrowed title.
 */

import type { Grid } from '$lib/games/nonogram/solver';
import { pickForDifficulty, prepareCandidate, type Difficulty, type Puzzle } from './pipeline';

/** mulberry32 — small, fast, deterministic. */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** FNV-1a — turns a seed string such as "2026-10-04:10:medium" into a number. */
export function hashSeed(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

type Shape = (x: number, y: number) => boolean;

function randomShape(rand: () => number, n: number, scale: number): Shape {
	const cx = n * (0.25 + rand() * 0.5);
	const cy = n * (0.25 + rand() * 0.5);
	const rx = n * scale * (0.5 + rand() * 0.5);
	const ry = n * scale * (0.5 + rand() * 0.5);
	if (rand() < 0.7) {
		return (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
	}
	return (x, y) => Math.abs(x + 0.5 - cx) <= rx && Math.abs(y + 0.5 - cy) <= ry;
}

/** A union of 2–4 shapes, minus an occasional hole. */
function blob(rand: () => number, n: number): Grid {
	const shapes = Array.from({ length: 2 + Math.floor(rand() * 3) }, () =>
		randomShape(rand, n, 0.32)
	);
	const hole = rand() < 0.5 ? randomShape(rand, n, 0.14) : null;
	return Array.from({ length: n }, (_, y) =>
		Array.from({ length: n }, (_, x) =>
			shapes.some((s) => s(x, y)) && !(hole && hole(x, y)) ? 1 : 0
		)
	);
}

/**
 * Search seeded blobs for an acceptable puzzle of the requested difficulty, keeping
 * other valid ones as candidates for `pickForDifficulty`. Bounded by `maxTries`.
 */
export function generateProcedural(
	size: number,
	target: Difficulty,
	seed: string,
	maxTries = 80
): Puzzle | null {
	const rand = seededRandom(hashSeed(seed));
	const valid: Puzzle[] = [];
	for (let i = 0; i < maxTries; i++) {
		const res = prepareCandidate(blob(rand, size));
		if (!res.ok) continue;
		if (res.puzzle.difficulty === target) return res.puzzle;
		valid.push(res.puzzle);
	}
	return pickForDifficulty(valid, target);
}
