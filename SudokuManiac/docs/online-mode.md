# Онлайн-режим (Online Competitive Mode)

## Обзор архитектуры

Используется схема **SSE + REST**:

- **Server → Client**: [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) — один постоянный поток для каждого клиента
- **Client → Server**: обычные `fetch` запросы (REST)
- **Хранилище комнат**: in-memory Map на сервере, без базы данных
- **Авторизация**: не нужна — работает как для залогиненных пользователей, так и для гостей

```
┌─────────────┐                        ┌──────────────────────────────────────┐
│   Браузер   │                        │              SvelteKit               │
│             │  GET /events  (SSE) ──▶│  events/+server.ts                   │
│  EventSource│◀── события ────────────│  subscribe(roomId, writer)           │
│             │                        │                                      │
│  fetch POST │──▶ /progress ─────────▶│  progress/+server.ts                 │
│  fetch POST │──▶ /start    ─────────▶│  start/+server.ts     broadcast() ──▶│
│  fetch POST │──▶ /solve    ─────────▶│  solve/+server.ts                    │
└─────────────┘                        └──────────────────────────────────────┘
                                                        │
                                              sse.ts broadcaster
                                              (in-memory registry)
                                                        │
                                              ┌─────────▼─────────┐
                                              │   store.ts (Map)   │
                                              │  rooms: Map<id,Room>│
                                              └───────────────────┘
```

---

## Слои кода

### 1. Хранилище — `src/lib/server/competitive/store.ts`

In-memory хранилище. Работает в рамках одного процесса сервера. Комнаты автоматически удаляются через 2 часа.

**Ключевые типы:**
```ts
interface RoomPlayer {
  id: string;
  name: string;
  gridState: number[][] | null;   // текущее поле игрока
  selectedRow: number;            // выбранная ячейка (для показа курсора)
  selectedCol: number;
  finishPosition: number | null;  // 1 = первый завершил
  timeSpent: number | null;       // секунды до завершения
  hintsUsed: number;
}

interface Room {
  id: string;           // UUID
  code: string;         // 6-символьный код (ABC123)
  hostId: string;       // кто создал комнату
  status: 'waiting' | 'in_progress' | 'finished';
  difficulty: Difficulty;
  gridSize: GridSize;
  puzzle: number[][] | null;    // null до старта
  solution: number[][] | null;  // никогда не отправляется клиенту
  maxPlayers: number;
  players: Map<string, RoomPlayer>;
}
```

**Доступные функции:**
| Функция | Описание |
|---|---|
| `createRoom(hostId, hostName, difficulty, gridSize, maxPlayers)` | Создаёт комнату, добавляет хоста |
| `joinRoom(room, playerId, playerName)` | Добавляет игрока или возвращает `{ error }` |
| `startRoom(room, requesterId)` | Генерирует пазл, меняет статус → `in_progress` |
| `updateProgress(room, playerId, gridState, row, col, hintsUsed)` | Обновляет поле игрока |
| `recordSolve(room, playerId, gridState, timeSpent)` | Проверяет решение, записывает позицию |
| `toPlayerInfo(player, gridSize)` | Конвертирует `RoomPlayer` в `PlayerInfo` для отправки клиенту |
| `getRoom(id)` | Поиск по UUID |
| `getRoomByCode(code)` | Поиск по коду (ABC123) |
| `listWaitingRooms()` | Список комнат в ожидании игроков |

---

### 2. SSE Broadcaster — `src/lib/server/competitive/sse.ts`

Реестр писателей (writer = функция, пишущая в SSE-поток). Один writer = один подключённый браузер.

```ts
subscribe(roomId, writer)  → () => void  // подписка, возвращает функцию отписки
broadcast(roomId, event, data)           // отправить событие всем в комнате
roomHasListeners(roomId)                 // есть ли подключённые клиенты
```

**Формат SSE-сообщения:**
```
event: player_progress
data: {"type":"player_progress","userId":"...","progress":42,...}

```
(пустая строка = конец события)

---

### 3. API-эндпоинты — `src/routes/api/competitive/rooms/`

#### Идентификация игрока (общий принцип)

Если в `locals.user` есть авторизованный пользователь — используется он.  
Если нет — читаются заголовки запроса:
```
x-player-id:   guest_a1b2c3d4
x-player-name: Vasya
```
Или из тела JSON (`guestId` / `guestName`) — в зависимости от эндпоинта.

#### Эндпоинты:

| Метод | URL | Действие |
|---|---|---|
| `POST` | `/api/competitive/rooms` | Создать комнату |
| `GET` | `/api/competitive/rooms` | Список открытых комнат |
| `POST` | `/api/competitive/rooms/join` | Войти по 6-символьному коду |
| `GET` | `/api/competitive/rooms/[id]` | Получить состояние комнаты |
| `POST` | `/api/competitive/rooms/[id]` | Войти по UUID |
| `GET` | `/api/competitive/rooms/[id]/events` | **Открыть SSE-поток** |
| `POST` | `/api/competitive/rooms/[id]/progress` | Отправить состояние поля |
| `POST` | `/api/competitive/rooms/[id]/start` | Запустить игру (только хост) |
| `POST` | `/api/competitive/rooms/[id]/solve` | Проверить решение |

#### `GET /events` — SSE-поток

При подключении **сразу отправляет** полное состояние комнаты (`room_state`), потом слушает broadcaster.  
При разрыве соединения (`request.signal` → `abort`) — рассылает `player_left` всем остальным.

#### `POST /progress`

Принимает `{ gridState, selectedRow, selectedCol, hintsUsed }`.  
Обновляет хранилище и делает `broadcast('player_progress', ...)` всем в комнате.  
Игнорирует запросы если статус комнаты не `in_progress`.

#### `POST /start`

Вызывает `startRoom()` — генерирует пазл через `generatePuzzle()`.  
Делает `broadcast('game_started', { puzzle, startedAt })`.  
Решение (`solution`) никогда не попадает в broadcast.

#### `POST /solve`

Вызывает `recordSolve()` — сравнивает `gridState` с `room.solution` ячейка за ячейкой.  
Если неверно — возвращает `{ valid: false }` (без broadcast).  
Если верно — `broadcast('player_finished', ...)`. Если все завершили — `broadcast('game_finished', ...)`.

---

### 4. SSE-события (Server → Client)

| Событие | Когда | Данные |
|---|---|---|
| `room_state` | При подключении к SSE | Полный снимок комнаты: статус, игроки, пазл |
| `player_joined` | Кто-то вошёл в комнату | `{ player: PlayerInfo }` |
| `player_left` | Кто-то закрыл вкладку / отключился | `{ userId }` |
| `game_started` | Хост нажал "Start" | `{ puzzle, startedAt }` |
| `player_progress` | Игрок отправил прогресс | `{ userId, progress, selectedRow, selectedCol, gridState }` |
| `player_finished` | Игрок решил пазл | `{ userId, finishPosition, timeSpent }` |
| `game_finished` | Все решили | `{ standings: Array<{userId, name, finishPosition, timeSpent, ...}> }` |

---

### 5. Клиентская сторона — `src/lib/competitive/room-connection.svelte.ts`

Svelte-модуль, создающий реактивный объект состояния комнаты.

#### Гостевая идентификация

Хранится в `localStorage`:
```ts
getOrCreateGuestId()    // "guest_a1b2c3d4" — генерируется один раз
getOrCreateGuestName()  // "Player_XZ1A" — генерируется один раз
setGuestName(name)      // пользователь может изменить
```

#### Фабрика соединения

```ts
const conn = createRoomConnection(handlers, userId)
//  handlers — коллбэки: onGameStarted, onPlayerFinished, onGameFinished, onSolveRejected
//  userId — ID авторизованного пользователя или null (гость)
```

**Возвращаемый объект:**
```ts
conn.state          // $state<RoomState> — реактивное состояние, читается из .svelte
conn.myId           // ID текущего игрока
conn.connect(roomId)            // открыть EventSource, подписаться на события
conn.disconnect()               // закрыть EventSource
conn.sendProgress(roomId, grid, row, col, hintsUsed)  // POST /progress
conn.sendSolveAttempt(roomId, grid, timeSpent, hintsUsed) // POST /solve
conn.sendStartRoom(roomId)      // POST /start
```

#### Заголовки для гостей

Авторизованный пользователь: заголовки не нужны (сессия через cookie).  
Гость: к каждому `fetch` добавляются `x-player-id` и `x-player-name`.  
SSE URL для гостя: `/events?guestId=guest_a1b2c3d4` (query param, т.к. EventSource не поддерживает кастомные заголовки).

#### Реактивное состояние (`conn.state`)

```ts
interface RoomState {
  connected: boolean;
  roomId: string | null;
  roomCode: string | null;    // "ABC123" — для отображения и invite link
  hostId: string | null;
  status: 'waiting' | 'in_progress' | 'finished';
  difficulty: Difficulty;
  gridSize: GridSize;
  puzzle: number[][] | null;
  maxPlayers: number;
  players: PlayerInfo[];      // включает gridState и selectedRow/Col
  finalStandings: ... | null;
  error: string | null;
}
```

---

### 6. UI — `src/routes/sudoku/competitive/+page.svelte`

Четыре экрана, переключаемые через `view: 'lobby' | 'room' | 'game' | 'results'`.

#### Lobby
- Если открыт по ссылке `?room=ABC123` → показывается приглашение с кнопкой "Join Room"
- Форма создания комнаты (сложность + размер)
- Поле для ввода кода + кнопка Join
- Список открытых комнат

#### Room (ожидание)
- Отображается invite-ссылка вида `https://…/sudoku/competitive?room=ABC123`
- Кнопка "Copy invite link" с тостом "✅ Copied!"
- URL браузера обновляется через `history.replaceState` — хост может просто скопировать адрес
- Хост видит кнопку "Start Game!" (активна когда 2+ игроков)

#### Game
- Верхняя панель: кнопка Abandon / таймер / переключатель Split ↔ PiP
- **Split**: два поля рядом — своё (интерактивное) + поле соперника (read-only, с жёлтым курсором)
- **PiP**: своё поле на весь экран + поле соперника в плавающем окне (правый нижний угол)
- Прогресс соперника отправляется каждые 1.5 с + сразу при выборе ячейки
- Курсор соперника передаётся через `PlayerInfo.selectedRow/Col` → `SudokuBoard.setOpponentSelection()`

#### Results
- Таблица с позицией, именем и временем каждого игрока

---

## Жизненный цикл партии

```
[Хост]                           [Сервер]                         [Гость]
  │                                  │                                │
  │── POST /rooms ──────────────────▶│ createRoom()                   │
  │◀─ { id, code } ─────────────────│                                │
  │                                  │                                │
  │── GET /events (SSE) ────────────▶│ subscribe(roomId, writer)      │
  │◀─ room_state ────────────────────│ (сразу при подключении)       │
  │                                  │                                │
  │                                  │◀── POST /rooms/join ──────────│
  │                                  │    joinRoom()                  │
  │◀─ player_joined (SSE) ───────────│ broadcast('player_joined')     │
  │                                  │──▶ player_joined (SSE) ───────▶│
  │                                  │◀── GET /events (SSE) ─────────│
  │                                  │──▶ room_state ────────────────▶│
  │                                  │                                │
  │── POST /start ──────────────────▶│ startRoom() + generatePuzzle() │
  │◀─ game_started (SSE) ────────────│ broadcast('game_started')      │
  │                                  │──▶ game_started (SSE) ────────▶│
  │                                  │                                │
  │ [каждые 1.5с]                    │                [каждые 1.5с]   │
  │── POST /progress ───────────────▶│ updateProgress()               │
  │                                  │──▶ player_progress (SSE) ─────▶│
  │◀─ player_progress (SSE) ─────────│◀── POST /progress ────────────│
  │                                  │                                │
  │── POST /solve ──────────────────▶│ recordSolve()                  │
  │◀─ { valid: true } ───────────────│                                │
  │◀─ player_finished (SSE) ─────────│ broadcast('player_finished')   │
  │                                  │──▶ player_finished (SSE) ─────▶│
  │                                  │◀── POST /solve ───────────────│
  │◀─ game_finished (SSE) ───────────│ broadcast('game_finished')     │
  │                                  │──▶ game_finished (SSE) ────────▶│
```

---

## Что хранится в БД

**Ничего.** Комнаты полностью in-memory. При перезапуске сервера все активные комнаты теряются.

Таблицы `competitive_rooms` и `room_participants` в `schema.ts` остались от предыдущей версии (на основе WebSocket + Drizzle), но **не используются**. При желании можно удалить или задействовать для истории партий.

---

## Ограничения текущей реализации

| Ограничение | Причина |
|---|---|
| Комнаты живут в памяти одного процесса | Простота; нет проблем с FK-ограничениями для гостей |
| Нет ELO-рейтинга | `eloRating` захардкожен как 1200, `eloDelta` = 0 |
| Нет реконнекта | Если гость обновил страницу — соединение теряется |
| Максимум 1 сервер | Нельзя масштабировать горизонтально без Redis |
| SSE не работает через некоторые прокси | Нужен `X-Accel-Buffering: no` (уже выставлен) |
