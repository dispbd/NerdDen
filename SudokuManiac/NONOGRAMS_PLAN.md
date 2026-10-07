# Nonograms (Picross) — implementation plan

The last unbuilt game from `EXPANSION_PLAN.md`. Picture-logic puzzles: fill cells
from row/column number clues to reveal a picture. Design source:
`_design_handoff/NerdDen Nonograms.dc.html`, mascot `assets/mascot-nono.png` (the Cat).

This plan was written after a parallel study of the mockup, the PixiJS engine, the
house wiring, and a proposed generation algorithm — **and after that algorithm was
adversarially reviewed and failed**. The corrections are folded in below and called out
where they changed the design.

---

## 0. Prerequisite outside this game (do first)

**`runAi` must become deadline-aware before any nonogram code is written.**

`src/lib/server/ai/provider.ts` loops over configured providers **sequentially**, and
passes no `abortSignal`, no `timeout` and no `maxRetries` to `generateText`. The AI SDK
also honours a `retry-after` header verbatim up to 60 s, so a single free-tier 429 can
sleep ~30 s *inside one provider attempt*, uninterruptibly. With five providers
configured, one "AI call" is not bounded by anything.

Consequence: every layered fallback in this plan is exception handling **inside** the
request. If the platform kills the invocation first, none of it runs and the user gets a
bodiless 504 — the exact failure the fallbacks exist to prevent.

- Add `runAi(fn, { deadlineMs })`; stop iterating providers once the budget is spent;
  pass `abortSignal` + `maxRetries` down to `generateText`.
- Add `export const config = { maxDuration: 60 }` to the generate endpoint
  (adapter-vercel only emits it when the route supplies it — nothing in the repo does
  today), and keep an internal AI budget well under it.

This also benefits Trivia and Crossword, which have the same exposure today.

---

## 1. Data model

`nonograms` — one puzzle:

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| title | text | the picture's name |
| topic | text | requested theme |
| size | integer | 5 / 10 / 15 (see §4 on why not larger) |
| difficulty | enum | graded from solver metrics, then **accepted/rejected against the request** |
| grid | jsonb | `string[]` of `#`/`.` rows — the solution |
| rowClues / colClues | jsonb | `number[][]` |
| prefilled | jsonb | `Array<{x, y, state: 'filled' \| 'empty'}>` — **tri-state, see §4** |
| aiGenerated | boolean | |
| solverStats | jsonb | rounds to fixpoint, wave-1 cells, reveals used |
| createdAt | timestamp | |

`nonogram_sessions` — one player's attempt: `userId` (nullable), `nonogramId`, `status`,
`playerGrid` (jsonb `"x,y" → 'filled' \| 'marked'`), `mistakes`, `hintsUsed`,
`timeSpent`, timestamps.

Also widen the shared `game_type` enum in **both** places in `schema.ts`
(`gameSessions` and `challenges`) — adding it to only one silently breaks the other.

---

## 2. Board renderer — a separate `NonogramBoard.ts`

**Do not extend `SudokuBoard`.** Every field on that class is `private` — `app`,
`boardContainer`, `cellBgs`, `cellSize`, `theme`, … with no `protected` member. A
subclass cannot read `cellSize` or reach `boardContainer` to add gutters, so "extending"
would start by rewriting the visibility of a class that ships two live modes
(single-player and the competitive opponent board). That is regression risk on shipped
Sudoku for no gain.

Write `src/lib/pixi/NonogramBoard.ts` modelled on `CrosswordBoard.ts`, sharing only
`themes.ts` and `animations.ts`. What is genuinely new:

- **Clue gutters** — the board is no longer square. Sudoku's `cellSize = (size - padding*2) / gridSize`
  and `resize(size)` assume a square canvas; the gutters need their own axis budget and a
  separate origin for `boardContainer`.
- **Gutter text lifecycle** — `updateCellDisplay()` destroys and recreates a `Text` on
  every change; clue numbers are static and must be created once and only restyled.
- **Per-line satisfied state** — dim a row/column's clues once the player's fills satisfy
  that line. No sudoku analogue.
- **Tri-state cell** — empty / filled / marked-blank. The mark should be `Graphics`
  strokes, not a `Text` glyph, and `getCellColor()` is pure sudoku semantics (selected >
  opponent > same-digit > errors > peers) and does not transfer.
- **Drag-to-paint** across cells, with the paint mode fixed by the first cell touched.

Two pre-existing bugs to avoid cloning from the Sudoku wrapper: the `onMount(async …)`
cleanup return is never honoured by Svelte (ResizeObserver leak), and `resize()` drops
`digitTexts` on the floor after `removeChildren()` (Text leak).

---

## 3. Generation pipeline

Order matters — **gates run last, on the grid that actually ships**:

```
PARSE/NORMALIZE → DESPECKLE → CONNECTIVITY → SHAPE+TRIVIALITY GATES → CLUES → ACCEPT TEST
```

1. **AI draw.** Ask for K candidate silhouettes at exactly N×N as row strings over
   `{#, .}`. Never ask the model for clues or arithmetic. Reuse `runAi` +
   `generateText` + `parseJsonFromText`; skip entirely when `!hasAnyAiKey()`.
   Set `maxOutputTokens` — three 15×15 grids plus prose can be truncated, and
   `parseJsonFromText` throws on a cut-off tail, losing *all* candidates at once.
2. **Normalize** — map `#/1/x/*` → filled, `./0/-/space` → empty; any other char rejects
   the candidate. Tolerate ±2 rows/cols by padding/cropping; beyond that, reject.
3. **Despeckle (bounded).** The naive rule "flip any cell whose whole 4-neighbourhood
   disagrees" **erases any 1-pixel diagonal entirely** — verified: a clean diagonal comes
   back blank. Diagonals are common in picture art. So: skip despeckle below 10×10, use a
   rule that spares diagonal continuity, and **reject the candidate if cleanup changes
   more than ~3% of cells or removes more than one component** — otherwise the shipped
   picture is no longer the picture the AI named.
4. **Connectivity** — drop filled components smaller than 3 cells; reject if the largest
   component is under 60% of filled cells.
5. **Shape + triviality gates** — fill ratio in [0.25, 0.75]; ≥3 distinct row patterns;
   free-line share below a size-dependent threshold. A line is free when
   `k === 0 || sum + k - 1 === n` — the original omitted `k === 0`, so all-empty lines
   (exactly what a picture's margins produce) were never counted as trivial.
6. **Clues** — for each line, the run lengths of filled cells. Assert
   `sum(rowClues) === sum(colClues) === filledCount`.

---

## 4. The accept test — line-solvability, not a solution count

**The one idea worth keeping from the study, and it is a good one.** Do *not* verify
uniqueness by counting solutions with a backtracking search. Require the strictly
stronger property:

> If constraint propagation alone (fixpoint of the exact line solver, no guessing)
> determines every cell without contradiction, the puzzle has **exactly one** solution.

The line DP marks a cell filled only when no valid completion of that line leaves it
empty, so every write holds in every global solution; if the result is total, every
solution equals it, and one exists (the source picture). Propagation is monotone, so it
terminates and is order-independent.

This is search-free, polynomial, needs no node budget, and additionally guarantees the
puzzle is solvable **by pure logic with no guessing** — which is what good picross
promises. Measured cost is negligible (sub-millisecond at 10×10, ~1 ms p95 at 15×15).

Corrections the review forced:

- **Reveals are tri-state.** When propagation stalls, revealing a cell's true value
  reveals `empty` roughly half the time (measured: 2778 of 5348). Persisting a
  "prefilled cells" *set of filled positions* silently drops those, and the puzzle is
  then **not** uniquely solvable from what ships. Persist
  `{x, y, state: 'filled' | 'empty'}`, render an empty reveal as a **locked X**, and
  re-run the accept test on `clues + reveals` to verify the exact shipped artefact.
- **The soundness evidence was circular.** "Cross-checked against an independent
  search-based counter" — that counter's first act is to call the same `propagate()`.
  Validate properly instead: fuzz `solveLine` against a brute-force oracle enumerating
  all 2ⁿ assignments for n ≤ 12 (asserting neither over- nor under-forcing), and run a
  counter that does not call propagate at all.
- **Sizes: 5 / 10 / 15 only.** Not for solver cost — that stays cheap — but for
  legibility and yield. Gutters add ~50% per axis, so 20×20 on a 375 px phone leaves
  ~10 px cells with numbers in them, and raw AI yield collapses past 15×15. Larger sizes
  are a later, curated-art feature.
- **Difficulty must be honoured.** Grading it post-hoc from solver metrics and labelling
  whatever the model drew is not the same as delivering the requested difficulty —
  accept/reject the candidate against the requested band.

---

## 5. Fallback ladder (reordered)

Curated art first — a named, hand-made picture beats a nameless procedural blob:

1. No AI key → straight to the curated bank.
2. AI call fails (quota/parse/deadline) → curated bank. Never a 500.
3. A candidate fails a gate → try the next candidate from the same response. Note these
   are **not independent**: the dominant failures (wrong row length, wrong alphabet,
   truncation) are properties of the whole response, so budget one retry, not three.
4. Candidate stalls the solver → bounded repair (≤3 reveals), else drop it.
5. **Curated bank** — ~20 hand-made pictures per size as row strings, with a vitest spec
   asserting every one is line-solvable. Guaranteed to exist, and keeps its real title.
6. **Procedural generator** — seeded blobs through the same pipeline. Last resort, and
   it must be labelled honestly ("Mystery shape"), never with an AI title for a picture
   that is no longer that picture. Seeding by date also gives a free daily puzzle.

No DB warm-pool in v1: it would be keyed by free-text theme (≈0 hit rate), and topping it
up after the response needs `waitUntil`, which this deployment does not have — the same
constraint that already orphaned the Alias WebSocket.

---

## 6. Screens (from the mockup)

- **Library & create** — Cat hero, dark "Paint one with AI" panel (topic + Paint), Size
  and Difficulty filter chips, 4-up catalogue cards with a pixel-grid thumbnail; solved
  cards reveal the picture in colour, unsolved render flat grey.
- **Generating** — bobbing Cat medallion, three-step checklist: picture chosen →
  computing clues → **checking unique solution**.
- **In play** — clue gutters, Fill/Mark tool toggle, Undo, Hint (with charge badge),
  mistakes `n/3`, timer, progress bar, "Cat's tip" card.
- **Victory** — the revealed picture, time / XP / accuracy.

---

## 7. Phases

- **N0 — deadline-aware `runAi`** (§0) + `maxDuration` on the generate route.
- **N1 — core logic, no UI**: clue computation, exact line solver, propagation fixpoint,
  despeckle/gates, repair. Vitest: the brute-force oracle fuzz, the non-circular counter,
  and a spec asserting every curated puzzle is line-solvable.
- **N2 — data + generation**: schema, `ai/nonogram.ts`, service, curated bank,
  procedural generator, API endpoints.
- **N3 — board**: `NonogramBoard.ts` + Svelte wrapper (gutters, tri-state, drag-paint).
- **N4 — screens**: library/create, generating, play, victory; i18n in all four locales;
  Home hub tile.
- **N5 — verify**: play a generated puzzle end-to-end, and exercise the no-AI-key path.

## 8. Out of scope
Multiplayer, colour nonograms, sizes above 15×15, puzzle sharing, and the expert
"guessing allowed" tier (its search budget was measured as unable to settle the very
instances it exists for).
