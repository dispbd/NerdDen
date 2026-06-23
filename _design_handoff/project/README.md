# Handoff: NerdDen — visual redesign (the "Kraft Draft" direction)

## Overview
A full visual redesign of the **NerdDen** game platform (multi-game: Sudoku → Crosswords → Alias, with Sudoku as the priority). The client disliked the previous design; the goal is a warm, minimalist, "hand-made" aesthetic: paper/kraft, softly rounded frames, hand-drawn accents and handwritten digits. The package covers the design system, mascots and 6 Sudoku screens (desktop + mobile).

The chosen and approved direction is **01 "Kraft Draft"** (warm kraft, slightly uneven ink frames, marker accents). Two other directions (02 "Soft Studio", 03 "Dotted Notebook") were rejected and are not in this package.

## About the Design Files
The files in `designs/` are **design references built in HTML** (prototypes showing look and behavior), **not production code to copy**. The task is to **recreate these mockups in the project's existing environment**, using its patterns and libraries:

- **SvelteKit 2 + Svelte 5**, TypeScript
- **TailwindCSS v4** (styling; tokens in `tokens.css`)
- **PixiJS 8** — renders the Sudoku game board (Canvas/WebGL)
- **better-auth** (profile/levels), **DrizzleORM + PostgreSQL**, **Paraglide** (i18n: en/ru), **Bun WebSockets** (online mode), **Storybook 10** (components)

`.dc.html` files are self-contained and open directly in a browser (the adjacent `support.js` is a viewer runtime, needed only to preview the prototypes — do NOT port it to production). The mockups are in English; the platform uses Paraglide (en/ru), so register translations for both languages.

## Fidelity
**High-fidelity (hi-fi).** Final colors, typography, spacing, radii, shadows and states. Recreate **pixel-for-pixel** against `tokens.css`. The Sudoku board in the mockups is drawn with DOM/CSS for demonstration only — in production it is rendered by **PixiJS** (the cell visual language is described below; carry it over 1:1).

---

## Design Tokens
All values live in **`tokens.css`** (CSS variables + a `@theme` block for Tailwind v4). Quick summary:

**Palette — paper/ink:** paper `#ECE3D2`, paper-card `#F1E9D9`, surface `#F7F1E4`, surface-2 `#FBF6EC`, ink `#322C24`, ink-soft `#6B6151`, muted `#9A917D`.
**Accents:** terracotta `#C2724F` (primary), navy `#3E5C76` (secondary/actions), mustard `#C29A45` (counters/hints), forest `#5F7657` (success/progress).
**Markers (entered digits):** red `#B5462E`, blue `#3E5C76`, green `#5B7355`.
**Dark theme:** paper `#2A2520`, surface `#342E26`, border `#4A4236`, ink `#ECE3D2`, accents slightly lighter (terracotta `#D08260`, navy `#5D83A3`, mustard `#CBA85A`, forest `#7D9670`).

**Typography:**
- `Bricolage Grotesque` 700 — headings (H1 ~38–54px desktop, ~26–30px mobile).
- `Hanken Grotesk` 400/500/600/700 — all interface text. Labels: 11–12px, 600, `letter-spacing:.12–.18em`, uppercase, muted color.
- `Caveat` 700 — **only** board digits, input-field values and button labels. Nowhere else.

**Radii:** base 8/12/16/18px + pill 999px. **Signature trick:** buttons and cards have slightly UNEVEN radii (imitating a hand drawing), e.g. `border-radius:15px 12px 16px 11px/12px 16px 11px 15px`. This is intentional — keep it.

**Shadows:** a "draft" hard offset shadow with no blur — `2px 3px 0 rgba(50,44,36,.85)` (primary button), `2px 3px 0 rgba(50,44,36,.10)` (card); soft `0 22px 50px rgba(50,44,36,.16)` (large containers).

**Dividers:** hand-drawn dashes — `1.5px dashed #C9BFA8`. Element borders — `1.5px solid #322C24` (ink).

---

## Global Components (repeat across all screens)

### Top bar
- 66px tall (desktop), paper-card `#F1E9D9` background, bottom edge dashed `1.5px dashed #C9BFA8`.
- Left: `NerdDen` logo (Bricolage 700, 20–23px) and/or a "← Menu" button.
- On the lobby — a game switcher: Sudoku (active) + Crosswords/Alias (dimmed `opacity:.5`, with mascot thumbnails). **The game-switching feature does not exist in the current code** — it is laid out for the future (Crosswords/Alias are not built yet); for now it only leads to Sudoku.
- Right: hint counter (mustard dot + number), level/XP, avatar.

### Buttons
- **Primary:** terracotta `#C2724F` background, `#FBF6EC` text, `1.5px solid #322C24` border, uneven radius, shadow `2px 3px 0 rgba(50,44,36,.85)`. **Label is Caveat 700** (letters merge softly — intentional, an approved tweak).
- **Secondary:** transparent background, ink border, ink text, Caveat 700.
- **Tertiary / danger:** no border, `#9A4A2E` text, sometimes a wavy underline (`text-decoration:wavy`).
- **Disabled:** `#ECE3D2` background, `#CDBFA6` border, muted-2 text, `cursor:not-allowed`.
- Long labels get `white-space:nowrap`.

### Input fields
- surface-2 `#FBF6EC` background, ink border, uneven radius. **Value is Caveat 700** (nickname, room code, digit). Label above the field — Hanken 600, 10–11px, uppercase, muted.

### Card
- surface `#F7F1E4` background, ink border, uneven radius, offset shadow `2px 3px 0 rgba(50,44,36,.10)`.

### Mascots (see Assets)
- Main — "Sudoku Maniac" (finished asset). Owl (Crosswords) and Hatter (Alias) are **rough sketches** for future games; in the profile they appear "locked" (`🔒`, `opacity:.7`, dashed border).

---

## Screens / Views
Every screen comes as desktop (1280px container) and mobile (390px). File names are listed in the Files section.

### 1. Sudoku Lobby (`NerdDen Lobby.dc.html`)
**Purpose:** game start — pick difficulty/size/mode or resume a game.
**Layout (desktop):** top bar; below it two columns — main (flex:1) + right rail (316px).
- **Hero:** Maniac avatar (70px, surface-2, border, shadow) + H1 "Sudoku" + subtitle.
- **"Quick game" card:** difficulty — 6 buttons (Beginner / Easy / Medium / Hard / Expert / Extreme; active = primary); size — 4×4 / 6×6 / 9×9 (active = navy); "Start game" (primary) and "Random" (secondary).
- **Game modes** (2×2 grid): Story (▶ terracotta icon), Custom (navy bars), Random (mustard dice), Online (competitive, "VS" forest). Icons are simple CSS shapes in marker colors.
- **Right rail:** "Continue game" — save cards with a mini-board (3×3 preview), difficulty, time, % filled and a "Continue" button (navy); "Day streak" (dark ink card, 7 weekday cells, filled = terracotta, future = dashed); mini-stats (solved / best time).
**Mobile:** single flow — hero → "Continue" (1 card) → "Quick game" (difficulty 3×2, size in a row, full-width buttons) → "Modes" (2×2 grid).

### 2. Sudoku Game screen (`NerdDen Game.dc.html`) — 3 states
**Purpose:** solving a puzzle.
**Layout (desktop):** top bar (← menu, difficulty badge, mistake counter `1/3`, Caveat timer, pause); body — board centered + right panel 330px.
- **9×9 board:** cell 52px (desktop) / 38px (mobile) / 42px (victory). Frame `2.5px solid #322C24`, radius 14px, thin lines `#DCD5C6` (1px), 3×3 box borders `2px solid #322C24`. Below the board — a progress bar (forest).
- **Numpad (desktop, right):** 9 buttons (Caveat ~32px) with a **remaining-count badge** in the corner (how many of that digit are still unplaced); a digit with "0 left" is dimmed; the selected digit is outlined in navy.
- **Actions:** Undo (↶), Erase (⌫, danger), **Notes** (✎, toggle — active state navy "on"), Hint (💡 + mustard remaining badge).
- **Mascot card:** the Maniac + a hint line (in-game help).
**Cell states (visual language — port to PixiJS 1:1):**
  - selected: `#ECCBB9` background + inset ring `2.5px #C2724F`;
  - peers (row/column/box): `#EFE7D4` background;
  - same digit as the selected one: `#DBE5EE` background;
  - error: `#F4D7CF` background, `#C81E1E` digit;
  - given (clue): ink `#322C24` digit;
  - player-entered: digit in marker colors (red/blue/green);
  - **note candidates:** a 3×3 mini-grid, Hanken 600, muted color `#8A8474`.
**Victory:** dimmed solved board + a "Solved!" modal card (mascot, time/+XP/+streak stats, "Again" / "To menu" buttons).

### 3. Profile / XP (`NerdDen Screens.dc.html`, section 1)
**Purpose:** player identity, progress, achievements.
- **Left column:** identity card — Maniac avatar (104px) with an overlapping level badge, nickname (Caveat 32px), join date, **XP bar** (terracotta fill, "to level 8 · 260"). Below — a "Mascots" card: Maniac (unlocked) + Owl/Hatter (`🔒`).
- **Right column:** 4 stat tiles (solved / best time / day streak / % no mistakes); **"Activity · 8 weeks"** — an 8×7 heatmap (5 forest steps); "Achievements" — a 2×2 grid (icon in a colored square + name + condition; unearned ones `opacity:.45`, `🔒`).
**Mobile:** identity centered → 2×2 stats → achievements list.
> See the "State & data" section for data sources.

### 4. Leaderboard (`NerdDen Screens.dc.html`, section 2)
**Purpose:** player ranking.
- Period switchers: **This week / All time / Friends** (active = primary).
- **Top-3 podium:** 1st is taller and terracotta (with a crown 👑), 2nd navy, 3rd forest; bars of different heights, avatar + name + XP.
- **List:** rank (Caveat) + avatar + name + "N solv." + XP; **the current player's row is highlighted** with `#ECCBB9` (here — #12 "Player_42 · you").
**Mobile:** period switchers in a row + a compact list (rank/avatar/name/XP).

### 5. Online duel (`NerdDen Screens.dc.html`, section 3)
**Purpose:** competitive 1×1 mode (who solves the same grid faster).
- **Desktop (match):** left — a VS panel with two players (avatar/name/level) and "VS", terms (difficulty/size/win condition), a "Ready!" button; right — a **real-time race**: two progress bars (you forest 68% / opponent terracotta 61%), match timer on a dark card + a hint line.
- **Mobile (search):** an animated circle with the mascot, "Finding an opponent…", match params, a dot indicator, "Cancel".
**Implementation:** via **Bun WebSockets** (PLAN.md). The opponent's progress arrives over the socket; the error penalty is 10s (shown in the hint line — confirm with game design).

### 6. Custom mode (`NerdDen Screens.dc.html`, section 4)
**Purpose:** manual game setup before start.
- **Options (left column):** board size (4×4 / 6×6 / 9×9 / 16×16; active navy); difficulty (5 buttons; active terracotta); "Assists" — three toggles: **Mistake highlighting** (on, forest), **Auto-notes** (off), **Hint limit** (on, "3 per game").
- **Preview (right column):** a mini-board + a summary (board/difficulty/hints) + "Start game".
**Mobile:** size (4 buttons) → difficulty (grid) → 2 toggles → "Start game".

---

## Interactions & Behavior
- **Selection chips** (difficulty/size/period/mascot): one active; active = accent fill + offset shadow; the rest are transparent with a border.
- **Toggles (Custom):** pill 46×26, on = forest + knob on the right, off = `#E3D8C2` + knob on the left.
- **Board:** tap/click a cell → select (background + ring) + highlight peers and same digits; enter via numpad or keyboard.
- **Notes (NEW, see below):** the toggle switches input mode — a digit goes into candidates instead of the answer.
- **Animations (recommendations):** victory modal appears with a soft fade+scale (~200ms); mascot reaction — a light wobble; duel progress bars — a smooth width transition on socket updates.
- **Responsive:** desktop — multi-column; mobile — a single vertical flow, full-width buttons, numpad as a 9-in-a-row strip, actions 4-in-a-row (icon above label).

---

## State & data (what needs to be wired behind the mockup)
Much of the mockup uses mock data. Below is what needs a real backend/state. Cross-check with `users / user_stats / achievements / game_sessions` from PLAN.md.

- **Profile:** nickname, join date, level, XP and the threshold to the next level (`user_stats`).
- **Stat tiles:** total solved, best time, current streak, % of games with no mistakes — aggregates over `game_sessions`.
- **Activity heatmap (8 weeks):** **no source exists in the current code/schema.** You need to: count solved games per day (aggregate `game_sessions` by completed date) and map them into 5 steps. Plan a query or a materialized view. The mockup uses a pseudo-random placeholder.
- **Achievements:** an `achievements` catalog + `user_achievements` (earned/date or locked). In the mockup 3 are earned and "Expert" is locked.
- **Leaderboard:** an ELO/XP ranking with a period filter (week/all/friends) + the current player's position (may be outside the top 3 — show their row highlighted). PLAN.md mentions ELO for competitive and global/weekly/monthly leaderboards — "Friends" is an extra filter, confirm.
- **Continue game (lobby):** unfinished `game_sessions` (status=in_progress) with % progress, time, and a mini snapshot of the board.
- **Day streak (lobby):** which weekdays are closed.
- **Hints:** the player's remaining hints + types/cost (Reveal/Highlight/Next step/AI) from PLAN.md; remaining-count badges on the buttons.
- **Online duel:** matchmaking + room + both players' progress over WebSocket; error penalty.

---

## ⚠️ New functionality designed in (ABSENT from the current code)

### Notes / candidates (pencil marks) — NEW
Approved by the client as a feature. It did not exist in the project's previous code.
- A **"Notes"** button — a toggle for input mode (active state navy "on").
- In notes mode a numpad digit is added as a **small mark** in a 3×3 grid inside the cell (not as the final answer). Tapping the same digit again removes the mark.
- Outside notes mode the digit is placed as the answer (large, Caveat).
- Candidates are rendered in muted `#8A8474` (Hanken 600) so they don't compete with answers.
- **What to add:** a `notes: Set<number>` (or `boolean[9]`) field on the cell model; input handling in notes mode; rendering the 3×3 candidate mini-grid in the PixiJS board; the "Notes" toggle button; (optional) the Custom "Auto-notes" — auto-fill candidates.

### Other items needing implementation
- **Activity heatmap** — no data source (see State).
- **Top-bar game switcher** — Crosswords/Alias not built yet (priority 2–3); placeholders for now.
- **Remaining-count badges** on numpad digits and on "Hint" — need a count of remaining digit occurrences and the hint balance.
- **Dark theme** — palette is in `tokens.css`; needs a switching mechanism (attribute/class on the root) and a board contrast check.
- **16×16 size** (Custom) and **6×6/4×4** — PLAN.md marks them as future options; the UI is ready, but the generator/validator for them is a separate task.

---

## Assets
In `assets/`. Mascots share a single warm "soft pixel-art" style.
- **`sudoku-maniac.webp`** — the main mascot "Sudoku Maniac" (a chick with a knife). Provided by the client, **production-ready**. Used as the default avatar, in hints, and on the victory screen.
- **`mascot-owl.png`** — "Scholar Owl" (in glasses) for **Crosswords**. A **rough sketch** (drawn during the design process) — redraw it into precise pixel-art matching the chick before production.
- **`mascot-alias.png`** — "Hatter" (a bird in a top hat, winking) for **Alias**. Also a **rough sketch**.
- Mode/status icons in the mockups are simple CSS shapes and emoji placeholders (🔥⚡✓🔒👑). Replace with the project's unified icon set during implementation.
- Fonts — Google Fonts: Bricolage Grotesque, Hanken Grotesk, Caveat (or the matching `@fontsource` packages).

---

## Files
In `designs/` (open in a browser; `support.js` is a viewer runtime only, not for production):
- **`NerdDen Design System.dc.html`** — the Direction 01 design system: palette, typography, buttons, fields, board, mascots, dark theme. The primary source of visual rules.
- **`NerdDen Lobby.dc.html`** — Sudoku lobby (desktop + mobile).
- **`NerdDen Game.dc.html`** — game screen: in-game (desktop + mobile) + victory state.
- **`NerdDen Screens.dc.html`** — Profile / Leaderboard / Online duel / Custom (desktop + mobile each).

Supporting:
- **`tokens.css`** — all design tokens (CSS variables + Tailwind v4 `@theme`).
- **`screenshots/`** — rendered PNGs of each screen.
- **`assets/`** — mascots.

> The mockups are in English. The platform uses Paraglide (en/ru) — register translations for both languages.
