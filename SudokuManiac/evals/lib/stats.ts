/** Small statistics helpers for comparing eval runs on few cases. */

/** Wilson score interval (95%) for k successes out of n. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
	if (n === 0) return [0, 0];
	const p = k / n;
	const d = 1 + (z * z) / n;
	const centre = (p + (z * z) / (2 * n)) / d;
	const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
	return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/**
 * Exact McNemar test on paired outcomes (same cases, two variants).
 * b = A passed & B failed, c = A failed & B passed. Two-sided p-value.
 */
export function mcnemar(b: number, c: number): number {
	const n = b + c;
	if (n === 0) return 1;
	const k = Math.min(b, c);
	let tail = 0;
	for (let i = 0; i <= k; i++) tail += binom(n, i);
	return Math.min(1, (2 * tail) / 2 ** n);
}

function binom(n: number, k: number): number {
	let r = 1;
	for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
	return r;
}

export function percentile(values: number[], p: number): number {
	if (!values.length) return NaN;
	const s = [...values].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
