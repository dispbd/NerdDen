# Trivia — Implementation Plan

AI-generated quiz game for NerdDen. Any topic → the Fox writes questions with four
options each; the player answers against a per-question timer, builds a streak, and
gets a Kraft-styled result. Solo first, Party (multiplayer) as a later phase.

Design source: `_design_handoff/NerdDen Trivia.dc.html` (+ screenshot), mascot
`_design_handoff/assets/mascot-trivia.png`. Reuses the established AI pattern
(`runAi` / `generateText` / `parseJsonFromText`, offline fallback) and the Kraft
Draft design system.

Workflow: one branch `game/trivia-solo` (Party gets its own branch later), one commit
per checklist item, a PR at the end of each phase, checkpoint between phases.

---

## Data model (Drizzle, `src/lib/server/db/schema.ts`)

Extend the shared `game_type` enums (`gameSessions`, `challenges`) to include
`'trivia'`.

### `trivia_sets` — a generated quiz (question bank)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| title | text | e.g. "Ancient Rome Quiz" |
| topic | text | AI topic |
| language | text default 'en' | en / ru / de / es |
| difficulty | enum(beginner…extreme) default 'medium' | maps to Easy/Medium/Hard in UI |
| questionCount | integer default 10 | 5 / 10 / 20 |
| aiGenerated | boolean default false | |
| createdAt | timestamp | |

Questions live in a child table so the correct answer + explanation never have to be
shipped to the client wholesale (mirrors the crossword "answers stripped" approach):

### `trivia_questions`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| setId | uuid → trivia_sets (cascade) | |
| orderIndex | integer | 0-based position |
| question | text | prompt |
| options | jsonb (string[4]) | four answers |
| correctIndex | integer | 0–3 — **never sent to client before answering** |
| explanation | text | shown in feedback card |

### `trivia_sessions` — one player's run through a set
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| userId | text → user (set null) | nullable — guests allowed |
| setId | uuid → trivia_sets (cascade) | |
| status | enum(in_progress, completed, abandoned) default in_progress | |
| currentIndex | integer default 0 | next unanswered question |
| score | integer default 0 | accumulated points |
| correctCount | integer default 0 | |
| currentStreak | integer default 0 | |
| bestStreak | integer default 0 | |
| answers | jsonb default [] | `[{ index, chosen, correct, points, msLeft }]` — server-authoritative |
| timeSpent | integer default 0 | seconds |
| createdAt / completedAt | timestamp | |

Relations added alongside the existing ones. Schema applied with `pnpm db:push`
(migrations are gitignored per repo convention).

---

## AI generation (`src/lib/server/ai/trivia.ts`)

`generateTriviaQuestions(topic, language, difficulty, count): Promise<TriviaQuestion[]>`

- Same shape as `alias.ts` / crossword `generator.ts`: `if (!hasAnyAiKey())` →
  offline fallback; otherwise `runAi((model) => generateText({ model, prompt }))`
  wrapped in try/catch → offline fallback on quota/parse/provider errors.
- Prompt: write the question **and** all four options **and** the explanation in the
  selected language; exactly one correct option; plausible distractors; no
  ambiguous/opinion questions; return strict JSON
  `{ "questions": [{ "question": "...", "options": ["..×4"], "correctIndex": 0, "explanation": "..." }] }`.
- Parse via `parseJsonFromText`; validate each item (4 distinct options,
  `correctIndex` in 0–3, non-empty explanation), shuffle option order server-side
  and re-point `correctIndex`, truncate to `count`.
- Offline fallback: a small static English question bank (like `FALLBACK_ENTRIES`) so
  the feature works with no API key.

---

## Scoring (server-authoritative, `src/lib/server/games/trivia/score.ts`)

Per correct answer: `base(100) + timeBonus(0…100 by fraction of time left)`, then
multiplied by the streak multiplier `min(1 + streak*0.1, 2.0)`; wrong → 0 points and
streak resets. `bestStreak` tracked. (Tuned so a strong 10-question run lands near the
~700–860 range shown in the mock.) All grading happens on the server; the client only
sends the chosen index + remaining ms.

---

## API (SvelteKit endpoints)

- `POST /api/trivia` → body `{ topic, language, difficulty, count, mode }`.
  Generate questions, insert `trivia_sets` + `trivia_questions`, create a
  `trivia_sessions` row, return `{ sessionId }`. (Solo; `mode:'party'` reserved for
  Phase T3.)
- `GET` load in `+page.server.ts` returns the set **with `correctIndex`/`explanation`
  stripped** and only questions up to `currentIndex` revealed.
- `POST /api/trivia/[id]/answer` → `{ index, chosen, msLeft }`. Server grades against
  `trivia_questions`, updates the session (score/streak/answers/currentIndex), returns
  `{ correct, correctIndex, explanation, points, streak, score }`.
- `POST /api/trivia/[id]/complete` → finalize status, compute XP, award achievements,
  update `userStats`; return summary for the result screen.

---

## UI (routes + components, Kraft Draft)

All screens rebuilt from the mock with existing tokens (`KraftTopBar`, paper/ink
palette, Caveat headings, terracotta primary button, offset draft shadows, dashed
dividers, uneven radii). Fox mascot = `mascot-trivia.png`.

**`/trivia` — create** (`+page.svelte` + `+page.server.ts` action):
- Topic input + example topic chips (Space / Cinema / Music…).
- Difficulty (Easy/Medium/Hard), Questions (5/10/20), Language (EN/RU/DE), Mode
  (Solo / Party — Party disabled until T3). "Generate quiz" primary button.
- Desktop variant adds the "The Fox asks" side card.
- On submit: show **generating** state (bobbing fox in dashed ring, animated dots,
  "The Fox writes questions…", topic·difficulty·count line, progress bar) while the
  POST runs, then redirect to `/trivia/[id]`.

**`/trivia/[id]` — play** (solo): single Svelte component, client state machine
`question → feedback → …→ results`:
- Header: ✕ exit, segmented progress bar (ok/bad/current/empty), `n/total`.
- Fox + streak `×N` on the left, SVG timer ring (counts down per question) on the
  right. On timeout → auto-submit as wrong.
- Question card + four option buttons (A–D key chips). Clicking locks the answer and
  POSTs; correct option turns forest-green with ✓, a wrong pick turns rust-red with ✕.
- Feedback card: green "Correct! +N pts" or red "Not quite — it's X", with the Fox and
  the explanation. "Next question ›" advances; last question → results.

**Solo result** (same route, `results` state): big Fox, headline ("Sharp mind!"),
topic·difficulty, three stat tiles (`correct`, `points`, `best streak`), XP +
achievement line, "New topic" / "Share" buttons.

**Integration:** Trivia tile on the Home hub (`/`), entry in `BottomNav`, Paraglide
messages (en/ru/de/es) compiled via the inlang CLI.

---

## Phases

- **T1 — Backend foundation** (branch `game/trivia-solo`): schema + relations, extend
  `game_type` enums, `db:push`; `ai/trivia.ts` generator + offline fallback;
  `games/trivia/score.ts`; `POST /api/trivia`, `/answer`, `/complete`. Typecheck +
  build. → part of the Phase-T1 PR.
- **T2 — Solo UI**: create + generating screen, play screen (timer/streak/feedback),
  solo results, Home tile + BottomNav + i18n. Typecheck + build. → PR, checkpoint.
- **T3 — Party mode** (separate branch, later): reuse Alias WebSocket rooms — lobby
  with invite code, host starts, synchronized question broadcast, live scoreboard,
  party leaderboard result (winner card + final standings + Rematch). Planned
  separately once Solo is merged.

## Out of scope / future
- Question images, categories browser, saved/replayable quizzes library, daily quiz,
  friend challenges via the `challenges` rail (schema already supports `trivia`).
