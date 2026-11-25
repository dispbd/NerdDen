/**
 * Compares the two explanation graders with hand labels.
 *
 *   npx tsx evals/hints/calibrate.ts evals/calibration/hints-labels.json <results.jsonl>…
 *
 * Human verdict = "facts true" AND "reasoning proves the move". Reports agreement, Cohen's
 * kappa and how often each grader catches a bad explanation, plus how often the extractor
 * read the move right. Self-graded answers (judge model = answering model) are split out
 * to show self-preference.
 */
import { existsSync, readFileSync } from 'node:fs';

const [labelsFile, ...files] = process.argv.slice(2);
if (!labelsFile || !files.length) throw new Error('usage: calibrate.ts <labels.json> <results.jsonl>…');
type Label = { moveRead?: string; factsTrue?: string; proves?: string };
// The page uses opaque ids (L01…); label-sheet.ts writes the mapping next to the page.
const keyFile = 'evals/calibration/hints-label.key.json';
const keyMap: Record<string, string> = existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, 'utf8')) : {};
const labels: Record<string, Label> = Object.fromEntries(
	Object.entries(JSON.parse(readFileSync(labelsFile, 'utf8')) as Record<string, Label>).map(([id, l]) => [keyMap[id] ?? id, l])
);

const graded = new Map<string, { judge?: string; claims?: string; grader?: string }>();
for (const f of files)
	for (const l of readFileSync(f.replace(/\.jsonl$/, '.judge.jsonl'), 'utf8').split('\n').filter(Boolean)) {
		const j = JSON.parse(l);
		const key = `${j.caseId}|${j.prompt}|${j.model}`;
		const g = graded.get(key) ?? {};
		if (j.kind === 'judge' && j.verdict) Object.assign(g, { judge: j.verdict.verdict, grader: j.grader });
		if (j.kind === 'claims' && j.result) g.claims = j.result.verdict;
		graded.set(key, g);
	}

interface Pair {
	human: boolean;
	grader: boolean;
	self: boolean;
}
const rows = Object.entries(labels).filter(([, l]) => l.factsTrue && l.proves);
const pairs = (method: 'judge' | 'claims'): Pair[] =>
	rows.flatMap(([key, l]) => {
		const g = graded.get(key);
		const v = g?.[method];
		if (!v) return [];
		const model = key.split('|')[2];
		return [{ human: l.factsTrue === 'yes' && l.proves === 'yes', grader: v === 'pass', self: g?.grader === model }];
	});

function stats(ps: Pair[]) {
	const n = ps.length;
	const tp = ps.filter((p) => !p.human && !p.grader).length; // bad explanation caught
	const fn = ps.filter((p) => !p.human && p.grader).length; // bad one passed
	const fp = ps.filter((p) => p.human && !p.grader).length; // good one failed
	const tn = n - tp - fn - fp;
	const po = (tp + tn) / n;
	const pYes = ((tn + fn) / n) * ((tn + fp) / n);
	const pNo = ((tp + fp) / n) * ((tp + fn) / n);
	const pe = pYes + pNo;
	const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
	return { n, agreement: po, kappa, catches: tp + fn ? tp / (tp + fn) : NaN, falseAlarms: tn + fp ? fp / (tn + fp) : NaN, tp, fn, fp, tn };
}
const f = (x: number) => (Number.isNaN(x) ? '–' : x.toFixed(2));

console.log('| Grader | Subset | n | Agreement | Cohen\'s κ | Catches bad (recall) | False alarms on good | TP/FN/FP/TN |\n|---|---|---|---|---|---|---|---|');
for (const method of ['judge', 'claims'] as const) {
	const all = pairs(method);
	const subsets: [string, Pair[]][] = [['all', all]];
	if (method === 'judge') subsets.push(['self-graded', all.filter((p) => p.self)], ['others', all.filter((p) => !p.self)]);
	for (const [name, ps] of subsets) {
		if (!ps.length) continue;
		const s = stats(ps);
		console.log(`| ${method === 'judge' ? 'LLM judge' : 'claims + code'} | ${name} | ${s.n} | ${f(s.agreement)} | ${f(s.kappa)} | ${f(s.catches)} | ${f(s.falseAlarms)} | ${s.tp}/${s.fn}/${s.fp}/${s.tn} |`);
	}
}
const reads = Object.values(labels).filter((l) => l.moveRead);
const human = rows.map(([, l]) => l.factsTrue === 'yes' && l.proves === 'yes');
console.log(`\nExtractor read the move right: ${reads.filter((l) => l.moveRead === 'yes').length}/${reads.length}`);
console.log(`Human: ${human.filter(Boolean).length}/${human.length} explanations good (facts true and reasoning proves the move)`);
