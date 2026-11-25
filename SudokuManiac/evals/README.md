# LLM evals

Repeatable checks for NerdDen's AI features: a golden set, deterministic scoring
against ground truth, prompt and model comparisons with latency and token use.
Plan and next suites: [EVALS_PLAN.md](../EVALS_PLAN.md).

## Hints (AI Sudoku tutor)

The tutor (`src/lib/server/ai/hints.ts`) costs the player 3 hints, so a wrong hint is
a paid failure. Sudoku gives an objective answer, so most of the scoring needs no judge.

**Golden set** — `datasets/hints.json`: 30 boards from the production generator
(easy / medium / hard × start / 40% / 75% of play), each with its solution and every
logical next move (naked and hidden singles). Seeded, so it rebuilds identically.

**Prompt versions** — `hints/prompts.ts`:

| | Prompt | Answer |
|---|---|---|
| v1 | production prompt, imported from `src/lib/server/ai/prompts/hints.ts` | free text |
| v2 | board with row/column labels, ask for one single | JSON: row, col, digit, technique, explanation |
| v3 | a solver finds the move, the model only explains it | free text |
| v4 | v3 plus the solver's argument (`hints/proof.ts`): which cells are ruled out, by which digit where; the model only puts it into words | free text |

**Checks per answer** — `hints/score.ts`:

| Check | Meaning |
|---|---|
| Answered | non-empty and not cut off (production treats both as a failed attempt) |
| Correct | the hint names a cell and digit, and the digit is right for that empty cell |
| Logical | that move follows by a single from the current board |
| ≤1 digit | the hint reveals at most one digit, as the prompt demands |
| Brief | 1–4 sentences |
| Valid JSON (v2) / Faithful (v3) | parsable answer / explains the move the solver gave |
| ≤8 s | fits the 8 s production budget before fail-over |

Free-text hints (v1, v3) go through an extractor model that turns the text into
`{row, col, digit}`; it is not one of the models under test.
Comparisons between prompts use an exact McNemar test on the same boards:
with 30 cases a few points of difference is noise.

### Run

```sh
npm run eval:hints:dataset                 # rebuild datasets/hints.json (seed 42)
npm run eval:hints                         # 30 boards × v1,v2,v3 × 3 models → evals/results/*.jsonl
npm run eval:hints -- --limit 3 --models groq --prompts v1,v2
npm run eval:report evals/results/<file>.jsonl
```

Keys come from `.env` (`GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, …). Calls are
throttled per model to stay inside free tiers and retried on 429 / 503 / timeouts; a full
run takes about 40 minutes, mostly waiting on Groq's 8,000 tokens-per-minute limit.
An interrupted run continues with `--resume <file>`.

### Results — 2026-11-24 baseline

`results/baseline-hints-2026-11-24.jsonl`, 30 boards × 3 prompts × 3 models, free tiers.
Correct is measured on answers that came back; Answered is availability.

| Model | Prompt | Answered | Correct of answered (95% CI) | p50 / p95 latency | ≤8 s | Output tokens |
|---|---|---|---|---|---|---|
| groq gpt-oss-120b (production primary) | v1 | 100% | **100%** (89–100) | 1.0 / 2.4 s | 100% | 430 |
| | v2 | 100% | **100%** (89–100) | 0.8 / 2.9 s | 100% | 421 |
| | v3 | 100% | **100%** (89–100) | 0.6 / 1.0 s | 100% | 139 |
| groq qwen3.8-27b | v1 | 97% | **100%** (88–100) | 1.5 / 4.0 s | 100% | 750 |
| | v2 | 90% | **100%** (88–100) | 2.4 / 5.9 s | 100% | 1220 |
| | v3 | 97% | **100%** (88–100) | 1.4 / 3.0 s | 97% | 600 |
| gemini-flash-lite-latest | v1 | 97% | **72%** (54–85) | 3.9 / 18.7 s | 73% | 937 |
| | v2 | 100% | **60%** (42–75) | 1.7 / 24.1 s | 80% | 224 |
| | v3 | 100% | **100%** (89–100) | 1.4 / 28.5 s | 80% | 98 |

Paired tests (McNemar): gemini v1 → v3 p = 0.008, v2 → v3 p < 0.001; v1 → v2 p = 0.34 (no difference).

**What it says**

- **v3 makes correctness independent of the model.** The weak model goes from 72% to 100%
  once the solver picks the move; JSON output alone (v2) does not help it. For the strong
  models v3 changes nothing in correctness but cuts output tokens 3× and p95 latency
  2.4 s → 1.0 s on gpt-oss-120b.
- **This golden set is too easy for strong models**: gpt-oss-120b and qwen score 100% with
  any prompt. The next cases must discriminate: boards with few singles, a player's mistake
  on the board, expert/extreme boards.
- **Availability is a separate problem.** qwen cut off 4 hard-board answers at the 2,500-token
  cap (reasoning) and Groq's free tier refused some requests outright (1,000 output tokens/min).
  Gemini flash-lite misses the 8 s production budget on 20–27% of calls.
- **First count was wrong**: refused requests were scored as wrong answers, which made
  qwen look 20 points worse on v2/v3. Quality and availability are now reported apart.

**Caveats**: the extractor that reads moves out of free text (v1, v3) has not been checked
against hand labels yet; v2 needs no extractor. Explanations are not judged in this table —
see "Explanations" below. (An earlier version of this note quoted a gpt-oss hint as wrong
reasoning; the claim checker showed it was right — row 3 lacks {1, 2, 7}, column 6 already has
1 and 2. Eyeballing is not a judge either.)

### Hard set

`datasets/hints-hard.json`: 30 expert/extreme opening positions with only 2–4 singles among
52–58 empty cells (build-dataset.ts `--max-singles 4`), so the move is hard to find.
Run with `--dataset evals/datasets/hints-hard.json --prompts v1,v3`.

Results (`results/baseline-hints-hard-2026-11-24.jsonl`):

| Model | Prompt | Answered | Correct of answered (95% CI) | p50 / p95 latency | Output tokens |
|---|---|---|---|---|---|
| groq gpt-oss-120b (production primary) | v1 | **60%** | 89% (67–97) | 4.6 / 6.0 s | 1962 |
| | v3 | 100% | **100%** (89–100) | 0.6 / 0.8 s | 156 |
| groq qwen3.8-27b | v1 | 23% | 86% (49–97) | 5.2 / 5.5 s | 2336 |
| | v3 | 83% | **100%** (87–100) | 1.7 / 2.6 s | 805 |
| gemini-flash-lite-latest | v1 | 73% | **18%** (7–39) | 6.6 / 11.8 s | 2410 |
| | v3 | 100% | **100%** (89–100) | 1.1 / 5.0 s | 158 |

- **The production prompt fails on hard boards before it is wrong**: gpt-oss-120b spends the
  whole 2,500-token cap reasoning on 40% of them (`finish=length`). Production treats that as
  a failed attempt and fails over — today to gemini-flash-latest (503) and a Mistral key with
  no quota — so the player gets "tutor unavailable" and a refund.
- **v3 removes both failure modes**: every model that answers is right, gpt-oss answers every
  board, and its p95 drops from 6.0 s to 0.8 s.
- Extractor: gpt-oss-20b for the first answers, gemini-flash-lite for the rest after Groq's
  daily token limit (200k/day for gpt-oss-20b) ran out; the hand labels check both.

### Explanations

A correct move can come with a wrong or hand-waving reason. Two graders, both run by
`hints/judge-run.ts`, on answers whose move is correct:

| Grader | How | Weak spot |
|---|---|---|
| **LLM judge** (`rubrics/hints-judge.md`) | gpt-oss-120b with a rubric and reference facts from the solver (missing digits of every unit, the cell's candidates, where the digit can still go), so it checks claims instead of solving the board | it also answers in the comparison: self-preference |
| **Claims + code** (`hints/facts.ts`) | gemini-flash-lite only transcribes the explanation into typed claims (`present`, `missing`, `candidates`, `excluded`, `only_place`); code verifies each against the board and checks that the true ones establish the move | parsing mistakes; reasoning shapes the checker doesn't know |

Both are calibrated against blind hand labels: `hints/label-sheet.ts` builds
`calibration/hints-label.html` (board, reference facts, hint — no verdicts), and
`hints/calibrate.ts` reports agreement, Cohen's κ, recall on bad explanations and false
alarms, with self-graded answers split out. The same labels check the move extractor.

```sh
npm run eval:judge -- evals/results/<run>.jsonl --prompts v1,v3 --per-group 15
npm run eval:judge:report -- evals/results/<run>.jsonl
npx tsx evals/hints/rescore-claims.ts evals/results/<run>.jsonl   # re-grade stored claims after checker changes
npm run eval:label -- evals/results/<run>.jsonl evals/results/<hard-run>.jsonl
npm run eval:calibrate -- evals/calibration/hints-labels.json evals/results/<run>.jsonl evals/results/<hard-run>.jsonl
```

Found while building it: on the first parse, the claim checker failed a correct explanation
because the parser wrote the conclusion ("leaving it as 7") as a claim and the checker could
not combine "row 1 lacks {7, 9}" with "9 can't go in r1c1". Both are fixed; the calibration
is what shows how many such misses remain.

#### Calibration — 2026-11-25

35 explanations from the baseline, 6 per model × prompt (5 for gpt-oss v3), half of them
failed by the judge; labelled blind by hand (`calibration/hints-labels.json`, ids mapped in
`hints-label.key.json`). The labeller judged 30 good and 5 bad.

| Grader | n | Agreement | Cohen's κ | Catches bad | Fails good | TP/FN/FP/TN |
|---|---|---|---|---|---|---|
| LLM judge (gpt-oss-120b) | 35 | 86% | 0.59 | 5 / 5 | 5 / 30 (17%) | 5/0/5/25 |
| — on its own answers | 11 | 82% | 0.62 | 3 / 3 | 2 / 8 | 3/0/2/6 |
| — on other models | 24 | 88% | 0.51 | 2 / 2 | 3 / 22 | 2/0/3/19 |
| Claims + code, first version | 34 | 68% | 0.18 | 2 / 2 | 11 / 32 | (first labels) |
| **Claims + code, current** | 34 | 85% | 0.59 | 5 / 5 | 5 / 29 (17%) | 5/0/5/24 |

The move extractor read 35 / 35 moves right.

How the numbers moved, so they are read with the right discount:

- **The labels were adjudicated.** The first pass had 3 / 35 labels the graders disputed with
  evidence ("row 2 already contains a 3" — it does not). The labeller re-checked them and
  changed all three. Graders that agree with the human are only as good as the human.
- **The checker was tuned on these same 35 items**, so its row is optimistic. Changes, each
  a whole class of argument rather than a case: elimination across units ("row 5 lacks
  {2,3,6,9}, column 6 has 2, 6, 9"), unit elimination ("row 1 and column 1 hold a 6, so box
  1 has one spot left"), a single-unit list the parser filed as cell candidates, and — after
  the re-labelling — "the only place is X" no longer counts as proof on its own (it is the
  conclusion, Q3), nor does "can't go in r2c4" when r2c4 is filled. The hard-set labels are
  the held-out check.
- **Where the graders still differ from the human**: vague explanations ("blocked by existing
  2s nearby", gemini v3) — the human accepted them, both graders did not; that is a policy
  question for the rubric, not a grader bug. The judge also misread two complete arguments
  (L08, L09); the parser lost one argument into an `other` claim (L09) and mis-transcribed one
  (L10).
- **Self-preference is not visible**: the judge catches all 3 bad gpt-oss answers it graded;
  it fails good ones a little more often on its own (2 / 8) than on others (3 / 22) — far
  too few items to tell.

**Explanation quality on the baseline** (all graded answers, 15 per group, current graders):

| Model | Prompt | Judge: pass (95% CI) | Claims: pass | Claims: any false claim |
|---|---|---|---|---|
| gpt-oss-120b | v1 | 87% (62–96) | 87% | 0% |
| | v3 | **13%** (4–38) | **27%** | **67%** |
| qwen3.8-27b | v1 | 93% (70–99) | 93% | 7% |
| | v3 | 100% (80–100) | 93% | 7% |
| gemini-flash-lite | v1 | 93% (70–99) | 87% | 7% |
| | v3 | **47%** (25–70) | **33%** | 7% |

**What it says about the tutor**: v3 makes the move right for every model, but the reasons
get worse for two of three. gpt-oss-120b invents them — code finds a false claim in 67% of
its v3 explanations, and 3 of its 5 labelled are bad. gemini-flash-lite does not lie but
asserts ("the only spot left") without ruling anything out. Only qwen explains as well as
with v1. Before v3 goes to production it should hand the model the solver's facts (what is
missing where, which cells are blocked by what), not only the move.

### v4 — the solver's argument in the prompt — 2026-11-25

`results/baseline-hints-v4-2026-11-25.jsonl` (main set, 30 boards × 3 models) and its
`.judge.jsonl` (15 explanations per model, same graders as above). The prompt lists the
facts that force the move, each naming where the blocking digit stands (`hints/proof.ts`):

```
5 is not yet in box 1. Its empty cells: r1c2, r1c3, r2c1, r2c2, r2c3, r3c1, r3c2.
Row 1 already has a 5 (r1c4), so 5 cannot go in r1c2, r1c3.
Column 2 already has a 5 (r7c2), so 5 cannot go in r2c2.
...
So r2c1 is the only cell of box 1 left for 5.
```

| Model | Correct move | p95 latency | Judge pass, v3 → v4 | Claims pass, v3 → v4 | Any false claim, v3 → v4 |
|---|---|---|---|---|---|
| gpt-oss-120b | 100% | 2.5 s | 13% → **87%** | 27% → **80%** | 67% → **20%** |
| gemini-flash-lite | 100% | 2.3 s | 47% → **100%** | 33% → **100%** | 7% → 0% |
| qwen3.8-27b | 100% | 2.0 s | 100% → 100% | 93% → 100% | 7% → 0% |

- **The invented reasons are gone for the most part.** Of gpt-oss's 3 flagged explanations,
  2 are real: it read "2 is not yet in box 1" as "the only missing digit is 2". The third is a
  parser error. Wording the fact as "box 1 has no 2 yet" is the next thing to try.
- v3 and v4 explanations were graded on mostly but not exactly the same boards (the first 15
  correct answers per group), so the comparison is not paired.
- The hard-set v4 run is incomplete: the machine slept mid-run and 21 gpt-oss answers failed
  to connect; it is not reported. The hard-set explanation grading for v1/v3
  (`baseline-hints-hard-2026-11-24.judge.jsonl`) is also partial (judge 52 / 70) and is not
  reported either.

### Not covered yet

- Boards where the player has made a mistake (a good tutor should point at it), and
  boards with no singles at all, where the next move needs harder techniques.
- A judge from another model family: on the free tiers available, gpt-oss-120b is the
  strongest model that answers; Gemini Pro models have no free quota.
