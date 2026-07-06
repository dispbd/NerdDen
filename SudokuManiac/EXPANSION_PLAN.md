# NerdDen — Platform Expansion Plan ("Kraft Draft", part 2)

Continuation of the Kraft Draft redesign. Part 1 (`REDESIGN_PLAN.md`, phases 0–4, all
merged) redressed Sudoku + the four Screens. This part covers the **new handoff**: a Home
hub, restyled Crosswords and Alias, and two future games (Trivia, Nonograms). Design source
of truth: `_design_handoff/*.dc.html` + `_design_handoff/screenshots/*.png`. Tokens are
unchanged from part 1.

## Decisions (agreed)
- **Order:** roadmap — Home hub → Crosswords → Alias. Trivia/Nonograms deferred.
- **New games (Trivia, Nonograms):** not built now — only the "coming soon" teaser on Home;
  their full scope is captured in *Future implementation* below.
- **Home / platform backend features:** implemented (not just visual stubs), except push
  notifications (infra) which stay in-app only for now.

## Workflow (same as part 1)
- One **branch per phase** (`redesign/phase-<n>-<slug>`), one **commit per item**,
  a **PR + checkpoint** per phase.

---

## Phase 5 — Home hub (`NerdDen Home.dc.html`) + platform backend

### Backend / data
1. **Cross-game account XP** — `user_stats` is already per-account; add an accessor/aggregate
   and surface account level/XP on the top bar and greeting (today only Sudoku feeds it —
   forward-compatible as other games award XP).
2. **Daily Den** — a service that yields today's item per game (Sudoku daily exists; add a
   crossword-of-the-day pick + an Alias topic-of-the-day) and a **cross-game "Den" streak**
   (new table + logic: a day counts when ≥1 Den item is completed). Distinct from the
   per-game Sudoku streak. Reset timer.
3. **Collectible mascots** — `user_mascots` unlock table + rule ("win in a game unlocks its
   mascot"); wire the Profile "locked" hooks and the Home mascots rail (1/3 unlocked).
4. **Content sharing** — shareable puzzle links (crossword already opens by `/crossword/[id]`;
   add a share entry-point + code); groundwork reused by other games later.
5. **Friend challenges (async)** — a `challenges` model (sender / receiver / game / puzzle /
   result) + in-app display on the Home "Friends" rail. Actual push is deferred (see Future).

### UI
6. **Home desktop** — top bar (logo + "your daily den", 🔥 streak, Level·XP, avatar);
   greeting + account XP bar; **Daily Den** (3 game cards + reset timer); **Your games**
   cards (Sudoku Continue/Play, Crosswords Library/Generate, Alias Join/New room) + a dashed
   **Trivia & Nonograms "coming soon"** teaser; right rail (**Generate anything** dark card,
   **Mascots** collection, **Friends**).
7. **Home mobile** — vertical flow (greeting, Generate-anything, Daily Den, Your games grid)
   + **bottom nav** (Home / Games / Ranks / Profile).
8. **Global chrome** — top-bar game switcher (Sudoku active; Crosswords/Alias link out),
   reusable mobile bottom-nav component, and make `/` render the Home hub (replacing the old
   3-card landing).
9. **i18n** (en/ru) for all new strings.

---

## Phase 6 — Crosswords (`NerdDen Crosswords.dc.html`)
Existing code: `/crossword` (library), `/crossword/[id]` (game), `ClueList` +
`CrosswordBoard` components, server `builder`/`service`/`generator`.
1. **Library / lobby** → Kraft: Owl hero, "Generate with AI" dark bar (topic + chips),
   filters (size / difficulty / language), 4-up puzzle cards (mini-grid thumbnail, AI badge,
   meta, difficulty badge, status).
2. **AI generation** — create form (topic + suggestion chips, language, difficulty-as-clue-
   style) + a **generating animation** state (Owl scribbling + step checklist).
3. **Game screen** → Kraft: board cell language (black squares, standard numbering,
   active-word highlight, navy selected ring), active-clue banner, Across/Down clue list with
   solved ✓, **hint toolbar** (Reveal letter + badge / Reveal word / Ask the Owl).
4. **Victory** → Kraft (Owl, time / +XP / accuracy).
5. **Board renderer** — carry the crossword cell language 1:1 (DOM today; PixiJS is the
   production target per handoff — port if the board is migrated).
6. **Hint helpers backend** — per-puzzle reveal count; "Ask the Owl" AI clue nudge (reuse
   the generation LLM).
7. i18n. **Scanword** stays a concept (no build) — see Future.

---

## Phase 7 — Alias (`NerdDen Alias.dc.html`)
Existing code: `/alias`, `/alias/[id]`, `connection.svelte.ts`, `protocol.ts`, server rooms.
1. **Create room + AI words** — topic + chips, language, difficulty, turn timer (30/60/90),
   words in hat (20/40/60), "Create & fill the hat" + a **filling-the-hat** animation state.
2. **Room lobby** — room-code card + Copy, team cards (swatch/name/players/join), "+ New
   team", host settings summary + Start.
3. **Turn — speaker** (dark screen) — team swatch + timer ring, live Got count, word-card
   stack, **swipe** (left = skip, right = got it) with big-button fallback.
4. **Turn — guessers** — word hidden; timer ring + live score tiles.
5. **Turn results** — tiles (guessed/skipped/points), word list with tags, team scores, pass.
6. **Game over** — winner block, standings table, Rematch / New room.
7. **Role-split rendering** over WebSocket; **swipe gesture**; i18n.

---

## Future implementation (captured, not built now)

### Trivia — NEW game (`NerdDen Trivia.dc.html`)
AI topic quiz, best fit for the AI superpower. Needs: schema (`questions` with 4 options +
`explanation`), AI question generation (topic/language/difficulty/count), **Solo** and
**Party** modes (Party reuses the Alias WebSocket rooms), per-question timer + streak
multiplier scoring, correct/wrong feedback with the Fox mascot, solo & party results.
Mascot asset `mascot-trivia.png` (Fox, rough sketch → finalize). Screens designed
(create/generating, question/feedback, results). Now: "coming soon" teaser on Home only.

### Nonograms / Picross — NEW game (`NerdDen Nonograms.dc.html`)
Picture-logic puzzle. **Reuses the Sudoku PixiJS board engine** (same grid/cells/input) with
different rules + row/column clue gutters. Needs: schema, AI picture→grid generation that
also **computes row/column clues** and **verifies a unique solution** (a real constraint),
Fill/Mark toggle, library (solved shows the picture), game, revealed-picture victory. Mascot
`mascot-nono.png` (Cat, rough sketch → finalize). Now: "coming soon" teaser only.

### Other absent functionality
- **Push notifications** for friend challenges — model + in-app display built in Phase 5;
  web-push delivery deferred (needs service-worker + push infra).
- **Scanword** crossword variant (concept) — clue-in-cell grid model + arrow-following input;
  a Phase-6-follow-up, not a spec.
- **Notes / candidates** in the Sudoku PixiJS board — still the styled stub button from
  phase 2 (no pencil-mark input/render yet).
- **Dark theme** toggle mechanism (palette in tokens; board contrast check).
- **a11y** — colorblind-safe board markers (red/green may clash); keyboard nav audit.
- **Onboarding / Settings** screens (language, theme, sound, accessibility).
- **PWA / offline** — installable app, asset + current-game cache, sync on reconnect.
- **16×16 / 6×6 / 4×4** Sudoku generator/validator (UI ready; algorithm is a separate task).
