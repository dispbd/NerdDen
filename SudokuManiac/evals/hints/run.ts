/**
 * Runs the hints eval: every case × prompt version × model, scored against the solution.
 *
 *   npx tsx evals/hints/run.ts [--models groq,groq:qwen/qwen3.8-27b,google:gemini-flash-lite-latest]
 *                              [--prompts v1,v2,v3] [--limit 30] [--resume <file>]
 *                              [--extractor groq:openai/gpt-oss-20b] [--dataset evals/datasets/hints.json]
 *
 * Models are "provider" (the app's default model) or "provider:model-id". The extractor
 * (reads the move out of free-text hints) should not be one of the models under test.
 *
 * Results stream to evals/results/hints-<timestamp>.jsonl (one line per answer), so an
 * interrupted run continues with --resume. Summarise with evals/hints/report.ts.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { generateText } from 'ai';
import { parseArgs } from 'node:util';
import { HINT_MAX_OUTPUT_TOKENS } from '../../src/lib/server/ai/prompts/hints.ts';
import { evalModel, LOW_REASONING, type EvalModel } from '../lib/models.ts';
import { throttled } from '../lib/throttle.ts';
import type { HintCase } from './types.ts';
import { buildPrompt, type PromptVersion } from './prompts.ts';
import { extractMoves, score } from './score.ts';

const { values: args } = parseArgs({
	options: {
		models: { type: 'string', default: 'groq,groq:qwen/qwen3.8-27b,google:gemini-flash-lite-latest' },
		prompts: { type: 'string', default: 'v1,v2,v3' },
		limit: { type: 'string' },
		extractor: { type: 'string', default: 'groq:openai/gpt-oss-20b' },
		resume: { type: 'string' },
		dataset: { type: 'string', default: 'evals/datasets/hints.json' }
	}
});

const { cases: allCases } = JSON.parse(readFileSync(args.dataset!, 'utf8')) as { cases: HintCase[] };
const cases = allCases.slice(0, args.limit ? Number(args.limit) : undefined);
const versions = args.prompts!.split(',') as PromptVersion[];
const models = await Promise.all(args.models!.split(',').map(evalModel));
// ~1,800 tokens reserved per extraction → ~4 calls a minute on Groq's free tier.
const extractor = await evalModel(args.extractor!, args.extractor!.startsWith('groq') ? 14_000 : undefined);

mkdirSync('evals/results', { recursive: true });
const out = args.resume ?? `evals/results/hints-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
const done = new Set<string>();
if (existsSync(out)) {
	for (const line of readFileSync(out, 'utf8').split('\n').filter(Boolean)) {
		const r = JSON.parse(line);
		if (!r.error) done.add(`${r.caseId}|${r.prompt}|${r.model}`);
	}
}

// ─── run: providers in parallel, calls within a provider sequential ──────────

const total = cases.length * versions.length * models.length;
let finished = done.size;
console.log(`${total} answers (${done.size} already done) → ${out}`);

async function runModel(m: EvalModel) {
	for (const c of cases) {
		for (const v of versions) {
			const key = `${c.id}|${v}|${m.name}`;
			if (done.has(key)) continue;
			const p = buildPrompt(v, c);
			const record: Record<string, unknown> = { caseId: c.id, prompt: v, model: m.name };
			try {
				// Latency of the successful call only: throttle waits and retries are excluded.
				let latencyMs = 0;
				const res = await throttled(m, async () => {
					const t0 = Date.now();
					const r = await generateText({
						model: m.model,
						prompt: p.prompt,
						maxOutputTokens: HINT_MAX_OUTPUT_TOKENS,
						providerOptions: LOW_REASONING,
						maxRetries: 0,
						abortSignal: AbortSignal.timeout(60_000)
					});
					latencyMs = Date.now() - t0;
					return r;
				});
				record.latencyMs = latencyMs;
				record.finishReason = res.finishReason;
				record.usage = res.usage;
				record.text = res.text;
				if (!res.text.trim() || res.finishReason === 'length') {
					// Production treats this as a failed attempt; so does the eval.
					record.incomplete = true;
				} else {
					const ex = await throttled(extractor, () => extractMoves(c, p, res.text, extractor.model));
					record.moves = ex.moves;
					if (!p.structured) record.extractor = extractor.name;
					if (ex.extractorError) record.extractorError = ex.extractorError;
					record.scores = score(c, p, ex);
				}
			} catch (e) {
				record.error = (e as Error).message?.slice(0, 300) ?? String(e);
			}
			appendFileSync(out, JSON.stringify(record) + '\n');
			finished++;
			const s = record.scores as { correct?: boolean } | undefined;
			console.log(
				`[${finished}/${total}] ${m.name} ${v} ${c.id}: ${record.error ? 'ERROR ' + record.error : record.incomplete ? 'incomplete' : s?.correct ? 'correct' : 'wrong'}${record.latencyMs ? ` (${record.latencyMs} ms)` : ''}`
			);
		}
	}
}

await Promise.all(models.map(runModel));
console.log(`done → ${out}\nreport: npx tsx evals/hints/report.ts ${out}`);
