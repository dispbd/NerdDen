/**
 * Re-grades stored claims with the current checker (facts.ts), without calling the parser
 * again. Rewrites <results>.judge.jsonl in place and prints what changed.
 *
 *   npx tsx evals/hints/rescore-claims.ts <results.jsonl> [--dataset evals/datasets/hints.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Claim, ClaimCheck } from './facts.ts';
import { gradeClaims } from './judge.ts';
import type { HintCase } from './types.ts';

const { values: args, positionals } = parseArgs({
	allowPositionals: true,
	options: { dataset: { type: 'string', default: 'evals/datasets/hints.json' } }
});
const file = positionals[0];
if (!file) throw new Error('usage: rescore-claims.ts <results.jsonl>');
const out = file.replace(/\.jsonl$/, '.judge.jsonl');

const cases = new Map(
	(JSON.parse(readFileSync(args.dataset!, 'utf8')) as { cases: HintCase[] }).cases.map((c) => [c.id, c])
);
const moves = new Map<string, { row: number; col: number; digit: number }[]>();
for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
	const r = JSON.parse(l);
	if (r.moves) moves.set(`${r.caseId}|${r.prompt}|${r.model}`, r.moves);
}

let changed = 0;
const lines = readFileSync(out, 'utf8')
	.split('\n')
	.filter(Boolean)
	.map((l) => {
		const j = JSON.parse(l);
		if (j.kind !== 'claims' || !j.result) return l;
		const c = cases.get(j.caseId)!;
		const move = moves.get(`${j.caseId}|${j.prompt}|${j.model}`)!.find((m) => c.playerGrid[m.row - 1][m.col - 1] === 0)!;
		// Re-derive from what the parser wrote, not from earlier checker output.
		const claims = (j.result.claims as ClaimCheck[]).map((x) => x.claim as Claim);
		const result = gradeClaims(c.playerGrid, move, claims);
		if (result.verdict !== j.result.verdict) {
			changed++;
			console.log(`${j.model} ${j.prompt} ${j.caseId}: ${j.result.verdict} → ${result.verdict}`);
		}
		return JSON.stringify({ ...j, result });
	});
writeFileSync(out, lines.join('\n') + '\n');
console.log(`${changed} verdicts changed → ${out}`);
