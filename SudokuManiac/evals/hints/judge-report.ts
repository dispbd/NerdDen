/**
 * Summarises graded explanations (<results>.judge.jsonl) per model × prompt.
 *
 *   npx tsx evals/hints/judge-report.ts evals/results/<file>.jsonl
 */
import { readFileSync } from 'node:fs';
import { wilson } from '../lib/stats.ts';

const file = process.argv[2];
if (!file) throw new Error('usage: judge-report.ts <results.jsonl>');

interface G {
	judge?: { verdict: string; justifies_move: boolean; factual_errors: string[] } | null;
	claims?: { verdict: string; checkable: number; falseClaims: { why: string }[]; establishes: boolean } | null;
}
const graded = new Map<string, G>();
for (const l of readFileSync(file.replace(/\.jsonl$/, '.judge.jsonl'), 'utf8').split('\n').filter(Boolean)) {
	const j = JSON.parse(l);
	if (j.error) continue;
	const key = `${j.model}|${j.prompt}|${j.caseId}`;
	const g = graded.get(key) ?? {};
	if (j.kind === 'judge') g.judge = j.verdict;
	else g.claims = j.result;
	graded.set(key, g);
}

const groups = new Map<string, G[]>();
for (const [key, g] of graded) {
	const [model, prompt] = key.split('|');
	groups.set(`${model}|${prompt}`, [...(groups.get(`${model}|${prompt}`) ?? []), g]);
}

const pct = (k: number, n: number) => (n ? `${Math.round((100 * k) / n)}%` : '–');
const ci = (k: number, n: number) => {
	const [lo, hi] = wilson(k, n);
	return `${Math.round(lo * 100)}–${Math.round(hi * 100)}`;
};

console.log(
	'| Model | Prompt | n | Judge: pass (95% CI) | Judge: factual errors | Judge: proves move | Claims: pass | Claims: any false | Claims: establish move | Judge vs claims agree |\n|---|---|---|---|---|---|---|---|---|---|'
);
for (const [key, gs] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
	const [model, prompt] = key.split('|');
	const j = gs.filter((g) => g.judge);
	const c = gs.filter((g) => g.claims);
	const both = gs.filter((g) => g.judge && g.claims);
	const jp = j.filter((g) => g.judge!.verdict === 'pass').length;
	console.log(
		`| ${model} | ${prompt} | ${gs.length} | **${pct(jp, j.length)}** (${ci(jp, j.length)}) | ${pct(j.filter((g) => g.judge!.factual_errors.length).length, j.length)} | ${pct(j.filter((g) => g.judge!.justifies_move).length, j.length)} | ${pct(c.filter((g) => g.claims!.verdict === 'pass').length, c.length)} | ${pct(c.filter((g) => g.claims!.falseClaims.length).length, c.length)} | ${pct(c.filter((g) => g.claims!.establishes).length, c.length)} | ${pct(both.filter((g) => g.judge!.verdict === g.claims!.verdict).length, both.length)} |`
	);
}

const whys = [...graded.values()].flatMap((g) => g.claims?.falseClaims.map((x) => x.why) ?? []);
console.log(`\nFalse claims found by code: ${whys.length}. Examples:`);
for (const w of whys.slice(0, 8)) console.log(`- ${w}`);
