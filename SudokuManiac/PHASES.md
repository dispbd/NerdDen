# SudokuManiac — Development Phases (Sudoku Focus)

These phases concentrate on polishing the Sudoku experience before returning to Crosswords and Hat/Alias.

---

## Phase 8-A — Tidy Up Navigation & Home Page
**Status: ✅ Done**

- Create a generic **"In Development"** page (`/coming-soon`) for games that are not yet ready.
- Change Header links for **Crosswords** and **Hat / Alias** to point to `/coming-soon`.
- Add a **Hat / Alias** card to the home page (coming-soon state, no active link).
- Update the Crosswords home card accordingly (consistent coming-soon look).

---

## Phase 8-B — Sudoku Sub-Navigation (Story & Competitive)
**Status: ✅ Done**

- Remove **Story** and **Competitive** from the global Header nav.
- Add **Story** and **Competitive** as mode cards / links inside the Sudoku page (`/sudoku`) alongside existing difficulty-based play.
- The global nav should only contain: Home | Sudoku | Leaderboard | Sign In / Sign Up.

---

## Phase 8-C — Save Slots / Continue Last Session
**Status: ✅ Done**

- Show a **"Continue"** button on the Sudoku page when an in-progress session exists (currently this already resumes, but it needs an explicit UI entry-point with a visual card: difficulty, time spent, date started).
- Allow guest users (no auth) to store up to **3 save slots** in `localStorage`.
- Authenticated users: save slots stored in the DB (existing `game_sessions` table).
- Save slot shows: puzzle thumbnail, difficulty, grid size, time spent, last-played date, and delete button.

---

## Phase 8-D — Local-First Progress (No Auth Required)
**Status: ✅ Done**

- All gameplay features work **without login**: session saves, history, stats, achievements.
- Guest state lives in `localStorage` (saves, history, achievement flags).
- **Auth becomes optional**: signing in merges/syncs local state to the server, enabling cross-device access.
- Show a subtle "Sign in to sync across devices" prompt instead of blocking behind auth.

---

## Phase 8-E — i18n (Localization)
**Status: ✅ Done**

- Wire up the already-installed **Paraglide (inlang)** library.
- Supported locales: **English (en)**, **Russian (ru)**, **German (de)**, **Spanish (es)**.
- Add a language switcher (globe icon drop-down) in the Header.
- Translate all static UI strings: navigation, buttons, labels, difficulty names, error messages, achievements.
- Locale persisted in `localStorage` + `Accept-Language` header detection for first visit.

---

## Phase 8-F — Mobile Optimisation
**Status: ✅ Done**

- Fully responsive layout: Header collapses to a hamburger menu on small screens.
- Sudoku board scales to fit the viewport without overflow (currently fixed-size canvas).
- Numpad buttons: minimum 48 × 48 px tap targets, optimised spacing for thumb reach.
- Touch events on the board (tap to select cell, no hover dependency).
- Swipe-to-open side panels (clue list in Crosswords once it returns, team list in Alias).
- Test on common breakpoints: 375 px (iPhone SE), 390 px (iPhone 15), 768 px (iPad), 1280 px+ (desktop).

---

## Paused Games (return after Phase 8-F)

| Game        | Status          | Remaining work                                               |
|-------------|-----------------|--------------------------------------------------------------|
| Crosswords  | ⏸ Paused        | Board interaction polish, auto-save, mobile touch            |
| Hat / Alias | ⏸ Paused        | WS stability, reconnect logic, mobile layout, test coverage  |
