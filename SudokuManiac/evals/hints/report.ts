/**
 * Summarises a hints run as a markdown table.
 *
 *   npx tsx evals/hints/report.ts evals/results/hints-<timestamp>.jsonl
 */
import { readFileSync } from 'node:fs';
import { mcnemar, percentile, wilson } from '../lib/stats.ts';
import type { Scores } from './score.ts';

interface Row {
	caseId: string;
	prompt: string;
	model: string;
	latencyMs?: number;
	usage?: { outputTokens?: number; totalTokens?: number };
	incomplete?: boolean;
	error?: string;
	scores?: Scores;
}

const file = process.argv[2];
if (!file) throw new Error('usage: report.ts <results.jsonl>');
// A resumed run appends retries of failed answers: the last record per answer wins.
const latest = new Map<string, Row>();
for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
	const r: Row = JSON.parse(l);
	latest.set(`${r.caseId}|${r.prompt}|${r.model}`, r);
}
const rows = [...latest.values()];

const pct = (k: number, n: number) => (n ? `${Math.round((100 * k) / n)}%` : '–');
const groups = new Map<string, Row[]>();
for (const r of rows) {
	const k = `${r.model}|${r.prompt}`;
	groups.set(k, [...(groups.get(k) ?? []), r]);
}

const PROD_ATTEMPT_MS = 8_000; // hints.ts gives one provider 8 s before failing over

const lines = [
	'| Model | Prompt | n | Answered | Correct of answered (95% CI) | Logical | ≤1 digit | Brief | Valid JSON / Faithful | p50 / p95 latency | ≤8 s | Output tokens (avg) |',
	'|---|---|---|---|---|---|---|---|---|---|---|---|'
];
for (const [key, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
	const [model, prompt] = key.split('|');
	const n = g.length;
	const scored = g.filter((r) => r.scores);
	const count = (f: (s: Scores) => boolean | undefined) => scored.filter((r) => f(r.scores!)).length;
	// Quality is measured on answers that came back; a refused or cut-off request is availability.
	const answered = scored.length;
	const correct = count((s) => s.correct);
	const [lo, hi] = wilson(correct, answered);
	const lat = g.filter((r) => r.latencyMs).map((r) => r.latencyMs!);
	const extra =
		prompt === 'v2' ? pct(count((s) => s.parsed), answered) : prompt === 'v3' || prompt === 'v4' ? pct(count((s) => s.faithful), answered) : '–';
	const tokens = g.filter((r) => r.usage?.outputTokens).map((r) => r.usage!.outputTokens!);
	lines.push(
		`| ${model} | ${prompt} | ${n} | ${pct(answered, n)} | **${pct(correct, answered)}** (${Math.round(lo * 100)}–${Math.round(hi * 100)}) | ${pct(count((s) => s.logical), answered)} | ${pct(count((s) => s.oneDigit), answered)} | ${pct(count((s) => s.brief), answered)} | ${extra} | ${(percentile(lat, 50) / 1000).toFixed(1)} / ${(percentile(lat, 95) / 1000).toFixed(1)} s | ${pct(lat.filter((x) => x <= PROD_ATTEMPT_MS).length, n)} | ${tokens.length ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : '–'} |`
	);
}

// Paired comparison of "correct" between prompt versions, per model.
const models = [...new Set(rows.map((r) => r.model))].sort();
const prompts = [...new Set(rows.map((r) => r.prompt))].sort();
const paired: string[] = [];
for (const model of models) {
	for (let i = 0; i < prompts.length; i++) {
		for (let j = i + 1; j < prompts.length; j++) {
			// Only boards both versions answered: a refused request says nothing about the prompt.
			const a = new Map(
				rows.filter((r) => r.model === model && r.prompt === prompts[i] && r.scores).map((r) => [r.caseId, !!r.scores!.correct])
			);
			const bRows = rows.filter((r) => r.model === model && r.prompt === prompts[j]);
			let onlyA = 0;
			let onlyB = 0;
			let n = 0;
			for (const r of bRows) {
				if (!a.has(r.caseId) || !r.scores) continue;
				n++;
				const ca = a.get(r.caseId)!;
				const cb = !!r.scores?.correct;
				if (ca && !cb) onlyA++;
				if (!ca && cb) onlyB++;
			}
			if (n) paired.push(`| ${model} | ${prompts[i]} → ${prompts[j]} | ${n} | ${onlyA} | ${onlyB} | ${mcnemar(onlyA, onlyB).toFixed(3)} |`);
		}
	}
}

const errors = rows.filter((r) => r.error || r.incomplete);
console.log(lines.join('\n'));
console.log('\nPaired comparison of "Correct" on boards both versions answered (McNemar, exact):\n');
console.log('| Model | Prompts | Cases | Only first correct | Only second correct | p |\n|---|---|---|---|---|---|');
console.log(paired.join('\n'));
if (errors.length) {
	console.log(`\n${errors.length} answers failed or were incomplete:`);
	for (const e of errors.slice(0, 10)) console.log(`- ${e.model} ${e.prompt} ${e.caseId}: ${e.error ?? 'incomplete (empty or cut off)'}`);
}
