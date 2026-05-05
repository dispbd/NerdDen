# NerdDen — Project Plan

A multi-game platform featuring Sudoku, Crosswords, and Hat/Alias.
Goal: portfolio project demonstrating a wide technology stack.

---

## Current Stack

| Category       | Technology                                       |
|---------------|--------------------------------------------------|
| Runtime        | Bun                                             |
| Framework      | SvelteKit 2 + Svelte 5                          |
| Language       | TypeScript                                       |
| Styling        | TailwindCSS v4                                   |
| Auth           | better-auth                                      |
| ORM + DB       | DrizzleORM + PostgreSQL (Docker)                 |
| i18n           | Paraglide (inlang)                               |
| Testing        | Vitest + Playwright                              |
| UI Dev         | Storybook 10                                     |
| Infrastructure | Docker Compose                                   |

### To Be Added

| Category        | Technology         | Purpose                                           |
|----------------|--------------------|---------------------------------------------------|
| Game Rendering  | **PixiJS 8**       | Canvas/WebGL rendering for game boards, animations|
| Real-time       | **Bun WebSockets** | Competitive mode (native Bun support)             |
| AI              | **Vercel AI SDK**  | Crossword generation, hints                       |

---

## Games

### 1. SudokuManiac (priority 1 — implement now)
Classic 9×9 Sudoku (+ 4×4, 6×6 variants in the future). Platform mascot planned.

### 2. Crosswords (priority 2 — future)
Crossword puzzles with AI generation by language and topic.

### 3. Hat / Alias (priority 3 — future)
Online "describe the word" team game.

---

## Platform Features

### Authentication & Profile
- Sign up / sign in (email, OAuth — GitHub, Google) via **better-auth**
- Profile: avatar, nickname, stats, game history
- Player levels based on accumulated XP

### Difficulty Levels
| Level       | Description                                |
|-------------|--------------------------------------------|
| Beginner    | Many given digits, simple logic            |
| Easy        | Standard for newcomers                     |
| Medium      | Requires basic techniques                  |
| Hard        | Advanced techniques required               |
| Expert      | Minimal hints, complex logic               |
| Extreme     | For professionals                          |

### Game Modes

| Mode            | Description                                                              |
|----------------|--------------------------------------------------------------------------|
| **Story**       | Progression through puzzle chains, unlocked sequentially                 |
| **Custom**      | User selects difficulty, grid size, type, and other settings             |
| **Random**      | Randomly generated puzzle at a chosen difficulty                         |
| **Competitive** | Online match — who solves the same puzzle fastest (1v1 or multi-player)  |

### Rating System
- ELO-style rating for competitive mode
- Separate rating per game
- Leaderboard: global, weekly, monthly
- Speed records leaderboard

### Achievements System
- Achievements for speed, win streaks, total puzzles solved
- Badges for modes, difficulty levels, event games
- XP and profile level
- Daily tasks (streak)

### Hint System
| Hint Type        | Description                                        | Cost      |
|-----------------|----------------------------------------------------|-----------|
| Reveal cell      | Show the correct value for one cell                | -1 hint   |
| Highlight errors | Show all incorrectly entered values                | -1 hint   |
| Next step        | Explain the next logical move                      | -2 hints  |
| AI hint          | Step-by-step strategy explanation (AI)             | -3 hints  |

Hints replenish over time / on wins / via purchase (monetization — future).

### AI Agent
| Game       | AI Capabilities                                                                    |
|------------|------------------------------------------------------------------------------------|
| Sudoku     | Hints with logic explanations; validation; possible thematic grid generation       |
| Crosswords | **Grid generation** by language (en/ru/…) and topic (history, sports, movies…)    |
| Hat        | Word set generation by topic and difficulty                                        |

---

## Database Schema (high-level)

```
users                  — profiles (better-auth + extensions)
user_stats             — XP, level, per-game rating
achievements           — achievements catalog
user_achievements      — user-earned badges

puzzles                — puzzle storage (Sudoku, Crosswords)
  ├── game_type        — sudoku | crossword | alias
  ├── difficulty       — difficulty level
  ├── data             — JSON with grid / board
  └── metadata         — author, tags, AI-generated flag

game_sessions          — user game sessions
  ├── puzzle_id
  ├── user_id
  ├── status           — in_progress | completed | abandoned
  ├── time_spent
  ├── hints_used
  └── moves            — JSON move log

competitive_rooms      — rooms for competitive mode
  ├── puzzle_id
  ├── status           — waiting | in_progress | finished
  └── participants     — linked to game_sessions

leaderboard            — snapshots for fast access
```

---

## Architecture

```
src/
├── lib/
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.ts           — shared schema
│   │   │   ├── sudoku.schema.ts
│   │   │   ├── crossword.schema.ts
│   │   │   └── auth.schema.ts
│   │   ├── auth.ts
│   │   ├── games/
│   │   │   ├── sudoku/
│   │   │   │   ├── generator.ts    — puzzle generation
│   │   │   │   ├── validator.ts    — solution validation
│   │   │   │   └── solver.ts       — solving algorithm
│   │   │   └── crossword/          — future
│   │   ├── ai/
│   │   │   └── hints.ts            — Vercel AI SDK
│   │   └── rating/
│   │       └── elo.ts
│   ├── pixi/                       — PixiJS components
│   │   ├── SudokuBoard.ts          — board renderer
│   │   ├── animations.ts           — effects
│   │   └── themes.ts               — visual themes
│   └── components/                 — Svelte UI components
│       ├── sudoku/
│       ├── crossword/              — future
│       └── shared/
├── routes/
│   ├── (auth)/                     — protected routes
│   ├── sudoku/
│   │   ├── +page.svelte            — lobby
│   │   ├── [id]/+page.svelte       — game screen
│   │   └── competitive/            — competitive mode
│   ├── crossword/                  — future
│   ├── alias/                      — future
│   ├── profile/[id]/
│   ├── leaderboard/
│   └── api/
│       ├── sudoku/
│       ├── competitive/            — WebSocket endpoint
│       └── ai/
└── hooks.server.ts                 — WebSocket + auth middleware
```

---

## Development Phases

### Phase 0 — Foundation ✅ (current state)
- [x] SvelteKit + Svelte 5 + TypeScript
- [x] TailwindCSS, Storybook, Vitest, Playwright
- [x] better-auth (basic setup)
- [x] DrizzleORM + PostgreSQL
- [x] Paraglide (i18n)

---

### Phase 1 — SudokuManiac MVP
**Goal**: playable single-player Sudoku without authentication.

- [ ] Install and configure PixiJS 8
- [ ] Sudoku generator (backtracking + cell removal algorithm)
- [ ] Validator / solver
- [ ] PixiJS board component: rendering, cell selection, digit input
- [ ] Basic UI: difficulty picker, timer, control buttons
- [ ] PixiJS animations: cell highlighting, errors, victory
- [ ] "Random game" mode
- [ ] Unit tests for generator and validator (Vitest)
- [ ] Storybook stories for board components

---

### Phase 2 — Authentication & Profile
**Goal**: users can sign in and save their progress.

- [ ] Extend DB schema (user_stats, game_sessions)
- [ ] Save / resume game state
- [ ] Profile: stats, game history
- [ ] OAuth (GitHub, Google) via better-auth

---

### Phase 3 — Progression & Rewards
**Goal**: user retention.

- [ ] XP and player level system
- [ ] Achievements (catalog + awarding)
- [ ] Daily tasks (streak)
- [ ] Hint system (spending, replenishment)
- [ ] AI hints (Vercel AI SDK)
- [ ] Leaderboard (by speed, by rating)

---

### Phase 4 — Story Mode & Custom Parameters
- [ ] Puzzle chains with sequential unlocking (stored in DB)
- [ ] Game settings: grid size (4×4, 6×6, 9×9), type, difficulty
- [ ] ELO rating

---

### Phase 5 — Competitive Mode (Online)
**Goal**: real-time multiplayer.

- [ ] WebSocket server on Bun (hooks.server.ts or standalone service)
- [ ] Rooms: create, search, invite
- [ ] Progress sync (without leaking the solution)
- [ ] Winner determination
- [ ] Post-match rating update
- [ ] E2E tests for multiplayer (Playwright)

---

### Phase 6 — Crosswords (future)
- [ ] Crossword engine (grid generation, word placement)
- [ ] AI generation by topic and language (Vercel AI SDK)
- [ ] Storage in DB
- [ ] Modes: random, thematic, competitive
- [ ] PixiJS board renderer

---

### Phase 7 — Hat / Alias (future)
- [ ] Rooms and teams
- [ ] Turn timer, word passing
- [ ] AI word set generation by topic
- [ ] Vote on turn results

---

### Phase 8 — Multi-Stack Showcase (future)
**Idea**: users can choose which stack powers the frontend and backend.

#### Frontend Options
- Svelte 5 (current)
- React 19
- Vue 3
- Angular

#### Backend / API Options
- SvelteKit API (current)
- Express.js / Fastify (Node)
- NestJS
- FastAPI (Python)
- Gin / Fiber (Go)

Each option is a separate deployment; switching via subdomain or query param.

---

## Technical Notes

### PixiJS Integration
PixiJS works with `<canvas>`; use via `onMount` in Svelte:
```ts
// src/lib/pixi/SudokuBoard.ts
import { Application, Graphics, Text } from 'pixi.js';
// Initialize inside onMount
```
- Light/dark themes via PixiJS color palettes
- Animations: `gsap` + PixiJS or the built-in Ticker

### WebSocket (Competitive Mode)
Bun supports WebSockets natively. Intercept the upgrade request in `hooks.server.ts`:
```ts
// hooks.server.ts
export const handleWebsocket = { ... }
```
Or extract into a standalone Bun service and proxy via nginx.

### AI Hints
Vercel AI SDK + any provider (OpenAI, Anthropic, Google):
```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
```
Sudoku prompts: analyze current grid → explain the next logical step.

### i18n
Paraglide is already configured. All in-game texts, hints, and messages go through `messages/*.json`.

---

## Portfolio Highlights

Key things to showcase:
1. **PixiJS** — unconventional choice for SvelteKit, demonstrates canvas/WebGL skills
2. **Real-time WebSockets on Bun** — modern stack
3. **AI integration** (Vercel AI SDK)
4. **Complex algorithms** — Sudoku generator/solver
5. **Full cycle**: auth + DB schema + real-time + testing

---

## Next Steps (start here)

1. Install PixiJS: `bun add pixi.js`
2. Create DB schema for Sudoku (`puzzles`, `game_sessions`)
3. Implement Sudoku generator (TypeScript, covered by Vitest)
4. Create PixiJS board component in Svelte
5. Build `/sudoku` page with difficulty selection and gameplay
