# LLM Evals — Plan

Turn the manual prompt checks I already do on NerdDen's AI features into a repeatable
eval suite: golden sets, deterministic checks, an LLM judge, and prompt/model comparisons
with cost and latency. Goal: every prompt or model change is backed by numbers.

---

## What gets evaluated

All five AI features already exist in `src/lib/server/ai/` and `games/crossword/generator.ts`.

| Suite     | Ground truth                                   | Deterministic checks                                                                                   | LLM judge (rubric)                                              |
|-----------|------------------------------------------------|--------------------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| **Hints** | Known solution of each board (`solver.ts`)     | Hinted cell/digit matches the solution; reveals ≤1 digit; the move is deducible from the current board | Explanation is correct, concise (2–4 sentences), names the right row/col/box |
| **Trivia**| Hand-checked reference questions per topic     | `normalize()` pass rate; 4 distinct options; language/script matches; explanation doesn't start with "Because"; no repeats from `avoid` | Correct answer is actually correct; no ambiguity; difficulty fits the level |
| **Crossword** | Builder output                             | Words valid `A–Z{3,15}`; correct transliteration for ru/de/es; % of words the builder could place       | Clue matches the word; clue doesn't contain the word; difficulty style |
| **Alias** | —                                              | Count, dedup, ≤4 words, language                                                                       | On topic; guessable; difficulty fits                             |
| **Nonogram** | Topic name                                  | `normalizeDrawing()` pass rate; pipeline says uniquely solvable                                         | Vision judge on the rendered PNG: is it recognisably the topic?  |

Hints are the strongest suite: an objective answer exists, so most of the scoring needs no judge.
Nonogram formalises the comparison already behind `DRAWING_PROVIDERS = ['google']`.

## Metrics per run

- Pass rate per deterministic check, judge score (mean + share of fails)
- JSON parse failure rate per provider (data for the generateText-vs-generateObject decision in `provider.ts`)
- Cost per request, p50/p95 latency, fallback rate
- For A vs B on the same cases: paired comparison (McNemar / sign test) and Wilson intervals;
  with 30 cases, a 5% difference is noise — the README says so

## Layout

```
evals/
  README.md                 how to run + latest results table
  promptfooconfig.yaml      shared defaults (providers, judge model)
  suites/
    hints.yaml  trivia.yaml  crossword.yaml  alias.yaml  nonogram.yaml
  datasets/                 golden sets (jsonl, versioned)
    hints.jsonl             30 boards from real games: puzzle, playerGrid, solution
    trivia.jsonl            20 topic × lang × difficulty cases
    ...
  asserts/                  deterministic checks, reuse production normalizers
    hints.ts  trivia.ts  crossword.ts  ...
  rubrics/                  judge prompts
    trivia.md  hints.md  crossword.md
  calibration/
    trivia.labels.jsonl     ~50 questions I labelled by hand
    calibrate.ts            judge vs my labels: agreement %, Cohen's kappa
  results/                  gitignored, except baseline.json
```

## Production prompts, not copies

Extract prompt builders and parsers into pure modules without `$env` / `$lib` imports,
so evals and production run the exact same code:

- `ai/prompts/trivia.ts` → `buildTriviaPrompt(params)`, `normalize()`
- same for alias, crossword, nonogram; `hints.ts` already has `buildPrompt()`
- prompt versions live side by side (`trivia.v1`, `trivia.v2`) until a winner is picked

## Tooling

> **Phase 1 deviation (2026-11-24):** the hints suite runs on its own small tsx runner
> (`evals/hints/run.ts`) instead of promptfoo: free tiers need per-model throttling and
> retries, and the runner calls models with exactly the app's settings. promptfoo can still
> be added later for the side-by-side viewer. Mistral's key currently has a 0 req/min limit
> and gemini-flash-latest returns 503, so phase 1 compared gpt-oss-120b, qwen3.8-27b and
> gemini-flash-lite-latest. Results: [evals/README.md](evals/README.md).

- **promptfoo**: prompts × models matrix, `llm-rubric` judge, built-in `cost` and `latency`
  assertions, web viewer for side-by-side diffs. Prompts and asserts as `file://…ts:fn`.
- **OpenRouter** as the eval provider: one key for gemini-flash, gpt-oss-120b, mistral-small,
  gpt-4o-mini, claude-haiku. Judge = a stronger model than the ones under test.
- **Langfuse** (stage 2): production traces via the AI SDK `experimental_telemetry` + OTel exporter;
  real requests from traces become new golden-set cases.

```yaml
# suites/trivia.yaml (sketch)
prompts:
  - file://../prompts.ts:triviaV1
  - file://../prompts.ts:triviaV2
providers:
  - openrouter:google/gemini-flash-latest
  - openrouter:openai/gpt-oss-120b
  - openrouter:mistralai/mistral-small
defaultTest:
  assert:
    - type: javascript
      value: file://../asserts/trivia.ts:structure   # schema, 4 distinct options, language
    - type: llm-rubric
      value: file://../rubrics/trivia.md
      provider: openrouter:anthropic/claude-sonnet   # judge
    - type: latency
      threshold: 8000
    - type: cost
      threshold: 0.002
tests: file://../datasets/trivia.jsonl
```

## Regression in CI

- PRs touching `src/lib/server/ai/**` or `prompts/**` run a smoke subset
  (10 cases per suite, cheapest model) and compare with `results/baseline.json`
- fail on: deterministic pass rate drop > 5 p.p., or any hints case revealing a wrong digit
- the full matrix runs manually before switching a model or prompt version

## Phases

1. **Day 1**: extract prompt builders; hints golden set + deterministic asserts; run 3 models
2. **Day 2**: trivia suite + judge + calibration against my labels; README with results table
3. **Later**: crossword/alias/nonogram suites, CI smoke run, Langfuse tracing

## Side fix found while planning

`/api/ai/hint` spends 3 hints in a loop and refunds on failure, but a retried request
charges again. Add an idempotency key (one charge per request id, refund once), so the
paid AI action is safe to retry.
