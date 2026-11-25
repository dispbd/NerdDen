/**
 * Grades the explanations of a hints run with both methods from judge.ts.
 *
 *   npx tsx evals/hints/judge-run.ts <results.jsonl> [--dataset evals/datasets/hints.json]
 *       [--prompts v1,v3] [--per-group 15] [--judge groq] [--parser google:gemini-flash-lite-latest]
 *
 * Only answers with a correct move are graded (a wrong move already fails). --per-group
 * caps how many answers per model × prompt are graded, to fit free-tier quotas.
 * Writes <results>.judge.jsonl; the judge and the claim parser run as two independent
 * queues on different models, and both resume.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { evalModel, type EvalModel } from '../lib/models.ts';
import { throttled } from '../lib/throttle.ts';
import { checkClaims, judgeExplanation } from './judge.ts';
import { V2Answer } from './score.ts';
import type { HintCase } from './types.ts';
import { parseJsonFromText } from '../../src/lib/server/ai/json.ts';

const { values: args, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		dataset: { type: 'string', default: 'evals/datasets/hints.json' },
		prompts: { type: 'string', default: 'v1,v3' },
		'per-group': { type: 'string' },
		judge: { type: 'string', default: 'groq' },
		parser: { type: 'string', default: 'google:gemini-flash-lite-latest' }
	}
});
const file = positionals[0];
if (!file) throw new Error('usage: judge-run.ts <results.jsonl>');
const out = file.replace(/\.jsonl$/, '.judge.jsonl');

interface Answer {
	caseId: string;
	prompt: string;
	model: string;
	text?: string;
	moves?: { row: number; col: number; digit: number }[];
	scores?: { correct: boolean };
}

const cases = new Map(
	(JSON.parse(readFileSync(args.dataset!, 'utf8')) as { cases: HintCase[] }).cases.map((c) => [c.id, c])
);
const prompts = args.prompts!.split(',');
const perGroup = args['per-group'] ? Number(args['per-group']) : Infinity;

// last record per answer wins (resumed runs append retries)
const latest = new Map<string, Answer>();
for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
	const r: Answer = JSON.parse(l);
	latest.set(`${r.caseId}|${r.prompt}|${r.model}`, r);
}
const taken = new Map<string, number>();
const todo = [...latest.values()].filter((r) => {
	if (!r.scores?.correct || !prompts.includes(r.prompt) || !cases.has(r.caseId)) return false;
	const g = `${r.model}|${r.prompt}`;
	if ((taken.get(g) ?? 0) >= perGroup) return false;
	taken.set(g, (taken.get(g) ?? 0) + 1);
	return true;
});

const done = new Set<string>();
if (existsSync(out))
	for (const l of readFileSync(out, 'utf8').split('\n').filter(Boolean)) {
		const r = JSON.parse(l);
		if (!r.error) done.add(`${r.kind}|${r.caseId}|${r.prompt}|${r.model}`);
	}

function explanationOf(r: Answer): string {
	if (r.prompt !== 'v2') return r.text ?? '';
	const p = V2Answer.safeParse(parseJsonFromText(r.text ?? ''));
	return p.success ? p.data.explanation : (r.text ?? '');
}
const moveOf = (r: Answer, c: HintCase) => r.moves!.find((m) => c.playerGrid[m.row - 1][m.col - 1] === 0)!;

// Groq reserves max_tokens against 8,000 tokens a minute: ~4,500 per judge call, ~5,000 per parse.
const judge = await evalModel(args.judge!, 34_000);
const parser = await evalModel(args.parser!, args.parser!.startsWith('groq') ? 38_000 : undefined);
console.log(`${todo.length} explanations to grade (judge ${judge.name}, parser ${parser.name}) → ${out}`);

async function queue(kind: 'judge' | 'claims', m: EvalModel) {
	let n = 0;
	for (const r of todo) {
		n++;
		if (done.has(`${kind}|${r.caseId}|${r.prompt}|${r.model}`)) continue;
		const c = cases.get(r.caseId)!;
		const move = moveOf(r, c);
		const explanation = explanationOf(r);
		const rec: Record<string, unknown> = { kind, caseId: r.caseId, prompt: r.prompt, model: r.model, grader: m.name };
		try {
			if (kind === 'judge') {
				const j = await throttled(m, () => judgeExplanation(c, move, explanation, m.model));
				Object.assign(rec, j);
			} else {
				const cl = await throttled(m, () => checkClaims(c, move, explanation, m.model));
				Object.assign(rec, cl);
			}
		} catch (e) {
			rec.error = (e as Error).message?.slice(0, 300);
		}
		appendFileSync(out, JSON.stringify(rec) + '\n');
		const v = (rec.verdict as { verdict?: string } | null)?.verdict ?? (rec.result as { verdict?: string } | null)?.verdict;
		console.log(`[${kind} ${n}/${todo.length}] ${r.model} ${r.prompt} ${r.caseId}: ${rec.error ? 'ERROR ' + rec.error : (v ?? 'unparsed')}`);
	}
}

await Promise.all([queue('judge', judge), queue('claims', parser)]);
console.log(`done → ${out}`);
