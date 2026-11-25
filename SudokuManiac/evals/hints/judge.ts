/**
 * Two independent ways to grade a hint's explanation:
 *
 * - judgeExplanation(): LLM-as-judge with a rubric and reference facts from the solver,
 *   so the judge checks claims against ground truth instead of solving the board itself;
 * - checkClaims(): an LLM only turns the explanation into structured claims, and code
 *   verifies each against the board (facts.ts). No judgement left to the model.
 *
 * Both are calibrated against hand labels (calibration/).
 */
import { readFileSync } from 'node:fs';
import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import { LOW_REASONING } from '../../src/lib/server/ai/config.ts';
import { parseJsonFromText } from '../../src/lib/server/ai/json.ts';
import { claimsEstablishMove, referenceFacts, verifyClaim, type Claim, type ClaimCheck } from './facts.ts';
import { labelledBoard } from './sudoku.ts';
import type { HintCase } from './types.ts';

type Move = { row: number; col: number; digit: number };

const call = (model: LanguageModel, prompt: string, maxOutputTokens: number) =>
	generateText({
		model,
		prompt,
		temperature: 0,
		maxOutputTokens,
		providerOptions: LOW_REASONING,
		maxRetries: 0,
		abortSignal: AbortSignal.timeout(90_000)
	});

// ─── LLM judge ───────────────────────────────────────────────────────────────

const RUBRIC = readFileSync(new URL('../rubrics/hints-judge.md', import.meta.url), 'utf8');

const Verdict = z.object({
	factual_errors: z.array(z.string()).default([]),
	justifies_move: z.boolean(),
	verdict: z.enum(['pass', 'fail'])
});
export type JudgeVerdict = z.infer<typeof Verdict>;

export async function judgeExplanation(c: HintCase, move: Move, explanation: string, judge: LanguageModel) {
	const prompt = RUBRIC.replace('{{board}}', () => labelledBoard(c.playerGrid))
		.replace('{{facts}}', () => referenceFacts(c.playerGrid, move))
		.replace('{{explanation}}', () => explanation);
	const res = await call(judge, prompt, 2000);
	try {
		return { verdict: Verdict.parse(parseJsonFromText(res.text)), raw: res.text };
	} catch (e) {
		return { verdict: null, raw: res.text, error: (e as Error).message };
	}
}

// ─── claims parsed by an LLM, verified by code ────────────────────────────────

const UnitZ = z.enum(['row', 'col', 'box']);
const D = z.coerce.number().int().min(1).max(9);
const ClaimZ = z.discriminatedUnion('type', [
	z.object({ type: z.literal('present'), unit: UnitZ, index: D, digits: z.array(D) }),
	z.object({ type: z.literal('missing'), unit: UnitZ, index: D, digits: z.array(D), exhaustive: z.boolean() }),
	z.object({ type: z.literal('candidates'), row: D, col: D, digits: z.array(D), exhaustive: z.boolean() }),
	z.object({ type: z.literal('excluded'), row: D, col: D, digit: D }),
	z.object({ type: z.literal('only_place'), unit: UnitZ, index: D, digit: D, row: D, col: D }),
	z.object({ type: z.literal('other'), text: z.string() })
]);

const CLAIMS_PROMPT = `Turn a Sudoku tutor's explanation into a list of factual claims about the board. Do not judge them — just transcribe.
Rows 1–9 top to bottom, columns 1–9 left to right, boxes 1–9 left to right, top to bottom.

Claim types (use "col" for column):
- {"type":"present","unit":"row|col|box","index":N,"digits":[...]} — these digits are already in that unit
- {"type":"missing","unit":"row|col|box","index":N,"digits":[...],"exhaustive":true|false} — these digits are missing from the unit; exhaustive=true if the text says these are ALL the missing ones ("only 7 and 9 are missing")
- {"type":"candidates","row":R,"col":C,"digits":[...],"exhaustive":true|false} — the cell can be these digits; exhaustive=true if "only"
- {"type":"excluded","row":R,"col":C,"digit":D} — the digit cannot go in that cell
- {"type":"only_place","unit":"row|col|box","index":N,"digit":D,"row":R,"col":C} — the digit can go only in that cell of the unit
- {"type":"other","text":"..."} — any other factual statement

One claim per statement; split lists like "row 3 has 1, 4 and 7, column 5 has 2" into separate claims per unit. Translate descriptions ("top-left box", "the middle row of box 5") into numbers.
Rules:
- Transcribe premises, not the conclusion: "so it must be 7" / "place 7 at r1c1" is not a claim.
- Use "candidates" only when the text says what the cell itself can be after its row, column and box are considered. A statement that comes from one unit only ("row 1 lacks 7 and 9, so its two empty cells take 7 and 9") is a "missing" claim about that unit.
- "present" is only for digits the text says are already written on the board.

Explanation:
"""
{{explanation}}
"""

Return ONLY JSON: { "claims": [ ... ] }`;

export interface ClaimResult {
	claims: ClaimCheck[];
	/** claims code could check */
	checkable: number;
	falseClaims: ClaimCheck[];
	/** a true claim on its own establishes the move */
	establishes: boolean;
	verdict: 'pass' | 'fail';
}

export async function checkClaims(c: HintCase, move: Move, explanation: string, parser: LanguageModel) {
	// Reasoning shares the cap with the JSON; at 2,500 a long explanation came back empty.
	const res = await call(parser, CLAIMS_PROMPT.replace('{{explanation}}', () => explanation), 4000);
	let claims: Claim[];
	try {
		const data = parseJsonFromText(res.text) as { claims?: unknown[] };
		// Drop malformed claims one by one rather than the whole list.
		claims = (data.claims ?? []).flatMap((x) => {
			const p = ClaimZ.safeParse(x);
			return p.success ? [p.data as Claim] : [];
		});
	} catch (e) {
		return { result: null, raw: res.text, error: `${(e as Error).message} (finish=${res.finishReason})` };
	}
	return { result: gradeClaims(c.playerGrid, move, claims), raw: res.text };
}

/** The code half of checkClaims; also used to re-grade stored claims after checker changes. */
export function gradeClaims(grid: HintCase['playerGrid'], move: Move, claims: Claim[]): ClaimResult {
	const checks = claims.map((cl) => verifyClaim(grid, cl));
	const falseClaims = checks.filter((x) => x.ok === false);
	const establishes = claimsEstablishMove(grid, move, checks);
	return {
		claims: checks,
		checkable: checks.filter((x) => x.ok !== null).length,
		falseClaims,
		establishes,
		verdict: !falseClaims.length && establishes ? 'pass' : 'fail'
	};
}
