# NerdDen — "Kraft Draft" Redesign Plan

Full visual redesign of the NerdDen platform to the approved **"Kraft Draft"** direction
(warm paper/ink, uneven hand-drawn frames, marker accents, Caveat for digits / field
values / button labels). Source of truth: `_design_handoff/project/designs/*.dc.html`
and the rendered references in `_design_handoff/project/screenshots/*.png`.

## Goals
- Don't just paint screens — establish a reusable **design structure**: shared Tailwind
  component classes + Svelte components for every repeated pattern.
- Match the mockups strictly. Where no mockup exists (Story, Print, auth) adapt to the
  general Kraft style. Absent functionality (Notes, mistake counter, etc.) → styled stubs.
- Preserve all game / WebSocket / data logic; change presentation only.

## Workflow
- One **branch per phase**: `redesign/phase-<n>-<slug>`.
- One **commit per item** (the numbered list inside each phase).
- Checkpoint (screenshots + review) at the end of every phase before starting the next.

---

## Phase 0 — Foundation & component system
Branch: `redesign/phase-0-foundation`

1. Fix the CSS cascade so component button styles win: move base element resets
   (`body`, `button`, `input`, `a`, helpers) into `@layer base`. Bug today: an unlayered
   `button { font-family: inherit }` overrides `.btn-*`, so Kraft buttons render in Hanken
   instead of Caveat.
2. Add Kraft CSS component classes in `layout.css @layer components`:
   `.btn-primary` / `.btn-secondary` / `.btn-danger` / disabled, `.chip` + `.chip-active`,
   `.pill` (+ difficulty / level / hint / status variants), `.kraft-input`, `.field-label`.
3. Add shared primitives in `src/lib/components/shared/`: `KraftAvatar.svelte`,
   `Pill.svelte`, `StatTile.svelte`, `XpBar.svelte`.
4. Add `Chip.svelte` and refactor `DifficultyPicker` (terracotta accent) and
   `GridSizePicker` (navy accent) onto Kraft chips.
5. Add `KraftToggle.svelte`, `MiniBoard.svelte`, `DayStreak.svelte`.
6. Refactor the existing screens (Profile, Leaderboard, Online duel, Custom) and
   `KraftTopBar` onto the shared classes / components (de-duplicate inline styles).

## Phase 1 — Sudoku lobby (`/sudoku`) → `NerdDen Lobby.dc.html`
Branch: `redesign/phase-1-lobby`

1. Two-column shell (main + 316px right rail) with hero (mascot avatar + H1 + subtitle).
2. "Quick game" card: difficulty chips, size chips, Start (primary) + Random (secondary).
3. Game-modes 2×2 grid (Story / Custom / Random / Online) with marker-color CSS icons.
4. Right rail: "Continue" save cards (MiniBoard preview, %, time, navy Continue button).
5. Right rail: "Day streak" dark ink card (7 weekday cells) + mini-stats (solved / best).
6. Refactor `SaveSlotCard` to Kraft; mobile single-column flow.

## Phase 2 — In-game & board → `NerdDen Game.dc.html`
Branch: `redesign/phase-2-game`

1. `Numpad` → cream Caveat keys, offset shadow, remaining-count badges, selected outline,
   danger erase.
2. `GameTimer` → large Caveat display.
3. In-game header: ← menu, difficulty pill, mistake counter `1/3` (stub), timer, pause;
   action row Undo / Erase / Notes (stub toggle) / Hint (+mustard badge).
4. Mascot hint card.
5. PixiJS board theme (`themes.ts`): cream cells `#FBF8F1`, ink frame, thin lines
   `#DCD5C6`, 3×3 box borders, state colors (selected / peers / same / error), marker
   digit colors; minimal `SudokuBoard.ts` tweaks for rounded frame + same-digit highlight.
6. Victory modal (Solved!, mascot, time / +XP / +streak, Again / To menu).

## Phase 3 — Secondary screens & modals (adapt to Kraft)
Branch: `redesign/phase-3-secondary`

1. `PrintModal` → Kraft (chips, pills, buttons, modal shell).
2. Story Mode → Kraft (chapter cards, puzzle tiles, locked states).
3. `coming-soon` page → Kraft.
4. Auth pages (`sign-in`, `sign-up`) + `(auth)` layout → Kraft.
5. `profile` root redirect page polish (if any visible chrome).

## Phase 4 — Accuracy pass on the four Screens
Branch: `redesign/phase-4-accuracy`

1. Profile — compare to reference, fix spacing/details.
2. Leaderboard — compare to reference, fix spacing/details.
3. Online duel — compare to reference, fix spacing/details.
4. Custom — compare to reference, fix spacing/details.
5. Final verification: `pnpm check` + `pnpm build` + screenshots.

---

## Out of scope (stubs / later, unchanged from prior decisions)
- Friends / weekly leaderboard windows (only all-time is real data).
- Mistake tracking (no-mistakes % approximated by hint-free solves; in-game `1/3` is a stub).
- Automatic matchmaking (duel uses room codes; the "searching" visual maps to waiting).
- 16×16 board (generator unsupported — disabled in Custom).
- Dark-theme toggle mechanism (palette exists in tokens; switcher deferred).
- Notes / candidates pencil-marks — styled toggle stub only (no input logic yet).
