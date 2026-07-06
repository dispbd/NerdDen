# Handoff: NerdDen — visual redesign (the "Kraft Draft" direction)

## Overview
A full visual redesign of the **NerdDen** game platform. The client disliked the previous design; the goal is a warm, minimalist, "hand-made" aesthetic: paper/kraft, softly rounded frames, hand-drawn accents and handwritten digits. The package covers the design system, mascots, a home hub, and screens for **five games** — three built/planned in the codebase (Sudoku, Crosswords, Alias) plus two new roadmap games (Trivia, Nonograms) — desktop + mobile. Games in the code: Sudoku (6 screens), Crosswords (library, AI generation, game, victory, scanword concept), Alias/Hat (create, lobby, turn, results, final). New games not yet in the code: Trivia (quiz), Nonograms (Picross) — see their sections and `roadmap-and-ideas.md`.

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

### 0. Home hub (`NerdDen Home.dc.html`)
**Purpose:** the platform's front door — ties the three games together (previously each game had only its own lobby; there was no home). This screen is the concrete expression of several roadmap ideas (see `roadmap-and-ideas.md`) — each is called out below with its backend need.
- **Greeting + account level bar:** XP/level is **account-wide, cross-game** (roadmap: cross-game progression). Sudoku currently owns level/XP — promote it to the account so all games feed one bar. Needs an aggregate XP source.
- **Daily Den:** one puzzle from each game per day (Sudoku solved ✓ · Crossword 61% · Alias party CTA), a reset timer, and a shared **day streak** (🔥12). NEW feature — needs a daily-content service (pick/seed one puzzle per game per day) + a streak that counts "any Daily Den item done today." Distinct from the per-game streak.
- **Your games:** a card per game with quick actions (Continue / Play / Generate / New room) + a dashed **"Trivia & Nonograms — coming soon"** teaser with "Notify me" (roadmap: next games).
- **Generate anything (rail):** a topic field → puzzle, surfacing the AI superpower on the home screen. Routes into the relevant game's generator (crossword today; trivia next).
- **Mascots collection (rail):** "1/3 unlocked", Owl/Hatter locked. NEW feature (roadmap: collectible mascots) — unlock a game's mascot by winning in that game. Needs an unlock table + rule per mascot. The lock hooks already appear in Profile.
- **Friends (rail):** async challenges ("Maya challenged you") and shared generated puzzles ("Timur shared a crossword"). NEW features (roadmap: async challenges + content sharing) — needs a challenge model (sender/receiver/puzzle/result + push) and shareable puzzle links (crossword already opens by `/crossword/[id]` — extend to a share flow).
- **Mobile:** same content vertically + a bottom nav (Home / Games / Ranks / Profile) — the app's primary navigation, not yet in code.

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

## Crosswords (`NerdDen Crosswords.dc.html`)
Covers the Crosswords game (game #2). Owl is the section's face — avatar, generation, hints. Built against the real code model: `grid` with `#` black squares, `clues` split across/down, AI generation by topic/language/difficulty. Files: one `.dc.html` with all five sections.

### 7. Library / lobby (desktop + mobile)
**Purpose:** browse ready puzzles or spin up a new one.
- **Top bar** game switcher now has Crosswords active (Sudoku/Alias dimmed).
- **Hero + quick generate:** an Owl avatar + a dark "Generate with AI" bar — a topic field (handwritten Caveat) + "Generate" button + quick topic chips. This is the compact entry; the full form is screen 8.
- **Filters:** size (All / Mini 11×11 / Standard 15×15 / Large 21×21), difficulty (Easy / Medium / Expert), language (EN·RU·DE·ES).
- **Puzzle grid (4-up):** cards with a mini grid thumbnail, title, an **AI badge**, meta (size · word count · lang), a difficulty badge and status (%/New/Done).
**Mobile:** quick-generate block + compact filters + a vertical card list.

### 8. AI generation (desktop create + mobile generating)
**Purpose:** author a themed crossword.
- **Create form:** topic field (large Caveat + suggestion chips); language (EN/RU/DE/ES — note: non-Latin is transliterated to A–Z for the grid, matching the generator); **difficulty as clue style** — Easy = simple definitions, Medium = definitions + gentle wordplay, Expert = cryptic conventions (exactly the three prompt modes in `generator.ts`); an Owl side panel explaining the 3 steps (AI drafts ~15 words + clues → builder interlocks the grid → saved to library). Grid size adapts to the words (~11×11 to 21×21, max 21×21 per code).
- **Generating state (mobile):** the Owl bobs and "scribbles" with a pencil; bouncing dots; a step checklist (word list ready → weaving the grid → numbering & saving). See New functionality.

### 9. Game screen (desktop + mobile)
**Purpose:** solving.
- **Board:** a real 11×11 grid with **standard numbering** (a number where an across or down word starts), black squares `#322C24`, thin 1px gaps. Active word highlighted (`#DCE6EF`), selected cell ringed navy `#3E5C76`. In production the board is **PixiJS** — port this cell language 1:1.
- **Active clue banner** above the board (e.g. "1 Across · A celestial body… (6)").
- **Clue list:** two columns Across / Down; the active clue is highlighted; solved clues get a green ✓.
- **Hints toolbar (NEW helpers):** **Reveal letter** (with a remaining-count badge), **Reveal word**, **Ask the Owl** (AI hint). Plus an Owl nudge card.
**Mobile:** board + an active-clue bar with ‹ › steppers + a letter keyboard row + three compact hint buttons.

### 10. Victory (`state · solved`)
A "All filled in!" card with the Owl, stats (time / +XP / accuracy), "New topic" / "Library".

### 11. Scanword concept (CONCEPT — not in code)
A future puzzle type shown as an explicit "Idea · not in code yet" concept: a 6×6 grid where **clues live inside dark cells** with **direction arrows** (no separate clue list), plus a legend explaining clue cell / arrow / answer cells. Reuses the same AI word lists — only the layout differs. A Phase-6 follow-up. See New functionality.

---

## Alias / Hat (`NerdDen Alias.dc.html`)
Covers the Alias/Hat game (game #3) — a real-time team game over **Bun WebSockets**, built against `alias/protocol.ts` (rooms, teams with score + players, turns where the speaker draws words and marks got_it/skip on a timer). **Mobile-first** — the phone is passed around the circle; desktop is the secondary host/shared screen. Hatter is the mascot. (Note: the repo already has a `KraftTopBar.svelte` — the "Kraft Draft" direction is already taking hold.)

### 12. Create room + AI words (mobile primary, desktop secondary)
**Purpose:** set up a room and fill the hat.
- Topic field (Caveat) + suggestion chips; language (EN/RU/DE/ES); difficulty (Easy/Medium/Hard); turn timer (30/60/90s); words in hat (20/40/60); "Create & fill the hat".
- **AI filling state (mobile):** the Hatter "pulls words from the hat" — word cards fly up out of a drawn top hat, bouncing dots, a progress bar (e.g. 29/40). See New functionality.

### 13. Room lobby (mobile + desktop host)
**Purpose:** gather teams before start.
- **Room code** card (e.g. `HAT-7K2`) with Copy.
- **Teams:** each team card = color swatch + name + player count + member chips + a "+ Join" pill; "+ New team". Host sees a settings summary (topic/difficulty/timer/word count) and "Start game".

### 14. The turn — speaker (mobile, dark screen)
**Purpose:** the active explainer's view.
- Dark background (it's "in hand"). Header: team swatch + a **timer ring**; a live "Got" count.
- **Word card stack** with the current word (large Bricolage). **Swipe gesture (NEW):** swipe left = skip, right = got it (shown with a rotated "GOT IT ✓" stamp and swipe hints); big **Skip** (red) / **Got it** (green) buttons as the accessible fallback. "N words left in the hat".

### 15. The turn — guessers (mobile)
**Purpose:** teammates' view — **no word shown**.
- "[Speaker] is explaining", a large timer ring, and live score tiles (guessed / this turn). The word is deliberately hidden so only the speaker sees it.

### 16. Turn results (mobile)
**Purpose:** recap a turn.
- Summary tiles (guessed / skipped / points); a **word list** with Got it / Skipped tags; current team scores; "Pass to [next team] ›".

### 17. Game over (mobile + desktop shared)
**Purpose:** final standings.
- Winner block (Hatter + 🏆), standings table (rank / color / name / players / score, winner row highlighted), "Rematch (same teams)" / "New room".

---

## Trivia (`NerdDen Trivia.dc.html`) — NEW GAME (not in code)
A topic quiz — the strongest fit for the AI superpower: the AI writes questions + four options each on any topic (topic / language / difficulty / count), solo or party. Roadmap game #1 (see `roadmap-and-ideas.md`). **Not in the codebase** — this is a from-scratch feature. Mobile-first. Mascot: **the Fox** (a bow-tied quizmaster; new asset `mascot-trivia.png`, a rough sketch to finalize).

### 18. Create + generating (mobile + desktop)
- **Create:** topic field (Caveat) + suggestion chips; difficulty; question count (5/10/20); language; **mode Solo / Party room** (party reuses the Alias WebSocket rooms).
- **Generating (mobile):** the Fox "writes questions" (bob + 💡 spark), bouncing dots, progress (6/10). Cosmetic wait state over the AI question-generation call.

### 19. Playing — question + answer feedback (mobile)
- **Question:** a question card, four options A–D, a per-question **timer ring**, a top **progress bar** (answered = green, wrong = red, current = terracotta), and a **streak multiplier**. Score can weight speed × streak.
- **Correct feedback:** the chosen/correct option turns green with a ✓; a green Fox card explains **why** (the teaching payoff — store an `explanation` per question).
- **Wrong feedback:** chosen option red with ✕, the correct one still marked green; a red Fox card gives the right answer + a note.

### 20. Results (mobile solo + desktop party)
- **Solo:** score (correct / points / best streak), +XP, an unlocked achievement, "New topic" / "Share".
- **Party:** a leaderboard with a winner block and standings (rank / avatar / name / correct / points, current player highlighted), "Rematch" / "New topic".

---

## Nonograms (`NerdDen Nonograms.dc.html`) — NEW GAME (not in code)
A picture-logic puzzle (Picross): fill the grid by row/column number clues until a hidden picture appears. Roadmap game #2. **Not in the codebase.** **Reuses the Sudoku board engine** — same PixiJS grid, cell states and input; only the rules and the clue gutters differ. The AI superpower still applies: the AI turns any topic into a small pixel picture, then **computes the row/column clues** from it. Mascot: **the Cat painter** (new asset `mascot-nono.png`, a rough sketch to finalize).

### 21. Library + create (desktop library + mobile generating)
- **Library:** cards where **solved puzzles show the picture** and unsolved ones are blank/locked; filters (size 5×5 / 10×10 / 15×15, difficulty); a dark "Paint one with AI" bar with the Cat.
- **Generating (mobile):** the Cat "paints a grid" — a step checklist (picture chosen → computing number clues → checking unique solution). **Note:** a good nonogram should have a **unique solution** — the generator must verify this (a real constraint, not just cosmetic).

### 22. Game screen (desktop + mobile)
- **Board:** a 10×10 grid with **number clues in the top and left gutters** (runs of filled cells per column/row), 5-cell block borders, filled cells `#322C24`, cells the player marks empty get a red ✕.
- **Tools:** a **Fill / Mark** toggle (fill picture cells / mark known-empty cells), Undo, Hint (limited, badge), a Cat tip card, mistakes counter + timer.
**Mobile:** board + Fill/Mark toggle + Undo/Hint.

### 23. Victory (`state · solved`)
The clean revealed picture (no clues), stats (time / +XP / clean), "New picture" / "Share". Sharing a solved picture is a natural viral hook (roadmap: content sharing).

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
- **Home hub is mostly new surface** — Daily Den (daily-content service + cross-game streak), cross-game account XP, collectible mascots (unlock table + rules), async friend challenges (challenge model + push), content sharing (shareable puzzle links), and the mobile bottom nav. See screen 0 and `roadmap-and-ideas.md` for the full rationale and priority order.
- **Activity heatmap** — no data source (see State).
- **Top-bar game switcher** — the switcher UI now spans all three games; wire routes as Crosswords/Alias ship.
- **Remaining-count badges** on numpad digits and on "Hint" — need a count of remaining digit occurrences and the hint balance.
- **Dark theme** — palette is in `tokens.css`; needs a switching mechanism (attribute/class on the root) and a board contrast check.
- **16×16 size** (Custom) and **6×6/4×4** — PLAN.md marks them as future options; the UI is ready, but the generator/validator for them is a separate task.

### Crosswords — new / notable
- **AI hint helpers:** **Reveal letter** (limited, badge count), **Reveal word**, **Ask the Owl** (AI clue hint). Reveal letter/word map to known cells; "Ask the Owl" is a new AI call — reuse the generation LLM to paraphrase/nudge a clue. Track a per-puzzle reveal count.
- **Generating animation:** a themed wait state (Owl scribbling + step checklist) while the generator runs. It's cosmetic — drive the steps from real generation phases if exposed, else time them.
- **Scanword (CONCEPT — not in code):** a new puzzle type where clues sit inside dark cells with direction arrows and there's no separate clue list. Needs a new grid model (clue-in-cell + direction), a renderer, and input that follows the arrow. Reuses the same AI word lists. Scoped as a Phase-6 follow-up — the mockup is a concept, not a spec.

### Alias — new / notable
- **Swipe gesture (speaker):** swipe the word card left = skip, right = got it, with big-button fallback. Add gesture handling on the speaker view; both actions emit the same events as the buttons (got_it / skip in `protocol.ts`).
- **AI word generation + "filling the hat" state:** the Hatter pulls words from a hat while the AI builds the themed word set (topic/language/difficulty/count). Cosmetic wait state over the existing word-generation call.
- **Role-split turn screens:** the speaker sees the word (dark screen); teammates see only timer + score (word hidden). Drive which view renders from the player's role in the room over WebSocket.


---

## Assets
In `assets/`. Mascots share a single warm "soft pixel-art" style.
- **`sudoku-maniac.webp`** — the main mascot "Sudoku Maniac" (a chick with a knife). Provided by the client, **production-ready**. Used as the default avatar, in hints, and on the victory screen.
- **`mascot-owl.png`** — "Scholar Owl" (in glasses) for **Crosswords** — the face of that section (avatar, generation, hints). A **rough sketch** (drawn during the design process) — redraw it into precise pixel-art matching the chick before production.
- **`mascot-alias.png`** — "Hatter" (a bird in a top hat, winking) for **Alias** — host of the room and the "filling the hat" state. Also a **rough sketch**.
- **`mascot-trivia.png`** — "the Fox" (a bow-tied quizmaster) for **Trivia**. A **rough sketch** (drawn during design) to finalize.
- **`mascot-nono.png`** — "the Cat" (a painter holding a brush) for **Nonograms**. A **rough sketch** to finalize.
- The mascot family is a system — one per game (Maniac · Owl · Hatter · Fox · Cat), all in the same warm soft pixel-art style; new games get new mascots.
- Mode/status icons in the mockups are simple CSS shapes and emoji placeholders (🔥⚡✓🔒👑). Replace with the project's unified icon set during implementation.
- Fonts — Google Fonts: Bricolage Grotesque, Hanken Grotesk, Caveat (or the matching `@fontsource` packages).

---

## Files
In `designs/` (open in a browser; `support.js` is a viewer runtime only, not for production):
- **`NerdDen Home.dc.html`** — the home hub: Daily Den, cross-game progression, Generate-anything, mascot collection, friends (desktop + mobile).
- **`NerdDen Design System.dc.html`** — the Direction 01 design system: palette, typography, buttons, fields, board, mascots, dark theme. The primary source of visual rules.
- **`NerdDen Lobby.dc.html`** — Sudoku lobby (desktop + mobile).
- **`NerdDen Game.dc.html`** — game screen: in-game (desktop + mobile) + victory state.
- **`NerdDen Screens.dc.html`** — Profile / Leaderboard / Online duel / Custom (desktop + mobile each).
- **`NerdDen Crosswords.dc.html`** — Crosswords: library, AI generation + generating state, game screen, victory, and the scanword concept.
- **`NerdDen Alias.dc.html`** — Alias/Hat: create room + AI words, room lobby, the turn (speaker / guessers / results), game over.
- **`NerdDen Trivia.dc.html`** — Trivia (NEW game): create + generating, question + answer feedback, solo & party results.
- **`NerdDen Nonograms.dc.html`** — Nonograms/Picross (NEW game): library + generating, game screen, revealed-picture victory.

Supporting:
- **`tokens.css`** — all design tokens (CSS variables + Tailwind v4 `@theme`).
- **`roadmap-and-ideas.md`** — product roadmap: platform improvements + which games to add next (and why not chess). The home hub and several "new functionality" items trace back to this.
- **`screenshots/`** — rendered PNGs of each screen.
- **`assets/`** — mascots.

> The mockups are in English. The platform uses Paraglide (en/ru) — register translations for both languages.
