# Alias realtime — WebSocket → DB polling

Alias has complete UI (create, lobby, speaker, guessers, results) but its multiplayer
**does not work**. This plan makes it actually run, using the transport already proven
by Trivia Party.

## Why

Two independent blockers, both fatal:

1. **The WebSocket handler is never mounted.** `src/lib/server/alias/websocket.ts`
   exports `handleAliasWebsocket`, and the client dials `/ws/alias`, but nothing in the
   app attaches that handler to a server — `hooks.server.ts` does not route it despite
   the file's comment. Nothing is listening.
2. **Serverless can't hold sockets.** The app deploys on `@sveltejs/adapter-vercel`;
   persistent WebSocket connections are impossible there regardless of wiring.

Two further details make the current design serverless-incompatible even if a socket
existed:

- Game state lives in an **in-memory `Map`** (`rooms.ts` → `gameStates`), lost on every
  cold start and not shared between instances.
- Turn expiry uses **`setTimeout`** (`scheduleTurnEnd`), a background timer no
  serverless function can keep.

## Approach

Port the Trivia Party pattern (`src/lib/server/games/trivia/party.ts`): state in the
DB, clients poll, and the timeline advances **lazily** on each request — no background
job, no sockets.

The existing game logic is reusable as-is: `startGame`, `startTurn`, `recordWordResult`
and `endTurn` in `rooms.ts` already operate on a plain, serializable `GameState`. Only
its **storage** (Map → jsonb column) and **turn expiry** (setTimeout → deadline) change.

## Data model

Extend `alias_rooms`:
| column | type | notes |
|---|---|---|
| gameState | jsonb | the existing `GameState` object (hat, usedWords, indices, turnResults) |
| turnEndsAt | timestamp | when the current turn expires — drives lazy advance |

Extend `alias_team_members`:
| column | type | notes |
|---|---|---|
| token | text | client-generated id so **guests** can act (mirrors Trivia Party); signed-in users still have `userId` |

## Server

`src/lib/server/alias/play.ts` (new), alongside the untouched `rooms.ts` helpers:

- `loadAndAdvance(roomId)` — load the room + state; while `turnEndsAt` has passed, run
  `endTurn` and begin the next turn (or finish the game), persisting each step.
- `getAliasState(roomId, token)` — role-aware poll payload: room, teams, scores, turn
  timer, words remaining, and **the current word only when the caller is the current
  speaker** (preserving the WS behaviour of sending the word to the speaker alone).
- `submitWordResult(roomId, token, result)` — speaker-only; wraps `recordWordResult`,
  draws the next word, ends the turn when the hat empties.
- `startAliasGame(roomId, token)` — host-only; wraps `startGame` + opens turn 1.
- Team join/create keep using the existing `rooms.ts` functions, plus the token.

## API

- `GET  /api/alias/[id]/state?token=…` — poll
- `POST /api/alias/[id]/join` — join a team (name + token, guests allowed)
- `POST /api/alias/[id]/start` — host starts
- `POST /api/alias/[id]/word` — speaker reports `got_it` / `skip`

## Client

Replace `src/lib/alias/connection.svelte.ts` (WS) with a polling store exposing the
**same surface** the page already consumes (`conn.joinTeam`, `conn.startGame`,
`conn.wordResult`, plus reactive room/turn state), so `/alias/[id]/+page.svelte`
changes as little as possible. Poll ~1.2s; tick the turn timer locally between polls
using the server clock, as the party screen does.

## Phases

- **A — data + service**: schema columns, `play.ts` (lazy advance, role-aware state).
- **B — API**: the four endpoints above.
- **C — client**: polling store + page wiring; delete the orphaned WS handler and
  `/ws/alias` client.
- **D — verify**: two simulated players through a full game (lobby → turns → results).

## Out of scope
Swipe gestures on the speaker card, turn-results screen polish, and reconnect/presence
indicators — the goal here is a working game loop, not new features.
