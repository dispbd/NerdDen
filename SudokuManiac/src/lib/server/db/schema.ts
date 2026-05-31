import { relations } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, uuid, jsonb, boolean, index, unique } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export * from './auth.schema';

// ─── User Stats ───────────────────────────────────────────────────────────────

export const userStats = pgTable('user_stats', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	sudokuPlayed: integer('sudoku_played').notNull().default(0),
	sudokuSolved: integer('sudoku_solved').notNull().default(0),
	/** Best solve time in seconds; null = no completed game yet */
	sudokuBestTimeSeconds: integer('sudoku_best_time_seconds'),
	totalXp: integer('total_xp').notNull().default(0),
	level: integer('level').notNull().default(1),
	/** Available hints to spend */
	hintsAvailable: integer('hints_available').notNull().default(3),
	/** Current daily streak in days */
	streakDays: integer('streak_days').notNull().default(0),
	/** Date of last completed puzzle (for streak tracking) */
	lastPlayedAt: timestamp('last_played_at'),
	/** ELO-style competitive rating (starts at 1200) */
	eloRating: integer('elo_rating').notNull().default(1200),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

// ─── Game Sessions ────────────────────────────────────────────────────────────

export const gameSessions = pgTable(
	'game_sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		/** Nullable — guests can play without signing in */
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		gameType: text('game_type', { enum: ['sudoku', 'crossword', 'alias'] }).notNull(),
		difficulty: text('difficulty', {
			enum: ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme']
		}).notNull(),
		status: text('status', { enum: ['in_progress', 'completed', 'abandoned'] })
			.notNull()
			.default('in_progress'),
		/** Elapsed seconds at last save */
		timeSpent: integer('time_spent').notNull().default(0),
		hintsUsed: integer('hints_used').notNull().default(0),
		/** Current player grid (9×9 numbers, 0 = empty) */
		gridState: jsonb('grid_state').notNull(),
		/** Original puzzle grid (0 = empty cell the player must fill) */
		puzzle: jsonb('puzzle'),
		/** Full solution grid */
		solution: jsonb('solution').notNull(),
		/** Grid size: 4, 6, or 9 */
		gridSize: integer('grid_size').notNull().default(9),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		completedAt: timestamp('completed_at')
	},
	(table) => [
		index('game_sessions_userId_idx').on(table.userId),
		index('game_sessions_status_idx').on(table.status)
	]
);

// ─── Achievements ─────────────────────────────────────────────────────────────

export const achievements = pgTable('achievements', {
	id: text('id').primaryKey(), // e.g. 'first_solve', 'speed_demon'
	title: text('title').notNull(),
	description: text('description').notNull(),
	icon: text('icon').notNull().default('🏆'),
	xpReward: integer('xp_reward').notNull().default(0),
	/** JSON condition descriptor — interpreted by the awarding engine */
	condition: jsonb('condition').notNull()
});

export const userAchievements = pgTable(
	'user_achievements',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		achievementId: text('achievement_id')
			.notNull()
			.references(() => achievements.id),
		earnedAt: timestamp('earned_at').defaultNow().notNull()
	},
	(table) => [
		unique('user_achievements_unique').on(table.userId, table.achievementId),
		index('user_achievements_userId_idx').on(table.userId)
	]
);

// ─── Daily Tasks ──────────────────────────────────────────────────────────────

export const dailyTasks = pgTable('daily_tasks', {
	id: uuid('id').defaultRandom().primaryKey(),
	/** YYYY-MM-DD — one row per calendar day */
	date: text('date').notNull().unique(),
	/** 'sudoku' | future games */
	gameType: text('game_type').notNull().default('sudoku'),
	difficulty: text('difficulty', {
		enum: ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme']
	}).notNull(),
	puzzle: jsonb('puzzle').notNull(),
	solution: jsonb('solution').notNull()
});

export const userDailyTasks = pgTable(
	'user_daily_tasks',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		dailyTaskId: uuid('daily_task_id')
			.notNull()
			.references(() => dailyTasks.id),
		status: text('status', { enum: ['in_progress', 'completed'] })
			.notNull()
			.default('in_progress'),
		timeSpent: integer('time_spent').notNull().default(0),
		hintsUsed: integer('hints_used').notNull().default(0),
		completedAt: timestamp('completed_at'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('user_daily_tasks_unique').on(table.userId, table.dailyTaskId),
		index('user_daily_tasks_userId_idx').on(table.userId)
	]
);

// ─── Story Mode ───────────────────────────────────────────────────────────────

export const storyChapters = pgTable('story_chapters', {
	id: uuid('id').defaultRandom().primaryKey(),
	title: text('title').notNull(),
	description: text('description').notNull(),
	/** 1-based display order */
	orderIndex: integer('order_index').notNull().unique(),
	/** User must complete this many puzzles in the previous chapter to unlock */
	requiredCompletedCount: integer('required_completed_count').notNull().default(0)
});

export const storyPuzzles = pgTable(
	'story_puzzles',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		chapterId: uuid('chapter_id')
			.notNull()
			.references(() => storyChapters.id, { onDelete: 'cascade' }),
		/** 1-based position within the chapter */
		orderIndex: integer('order_index').notNull(),
		difficulty: text('difficulty', {
			enum: ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme']
		}).notNull(),
		/** Grid size: 4, 6, or 9 */
		gridSize: integer('grid_size').notNull().default(9),
		puzzle: jsonb('puzzle').notNull(),
		solution: jsonb('solution').notNull()
	},
	(table) => [unique('story_puzzles_chapter_order').on(table.chapterId, table.orderIndex)]
);

export const userStoryProgress = pgTable(
	'user_story_progress',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		puzzleId: uuid('puzzle_id')
			.notNull()
			.references(() => storyPuzzles.id, { onDelete: 'cascade' }),
		status: text('status', { enum: ['in_progress', 'completed'] })
			.notNull()
			.default('in_progress'),
		timeSpent: integer('time_spent').notNull().default(0),
		hintsUsed: integer('hints_used').notNull().default(0),
		completedAt: timestamp('completed_at'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('user_story_progress_unique').on(table.userId, table.puzzleId),
		index('user_story_progress_userId_idx').on(table.userId)
	]
);

// ─── Competitive Mode ─────────────────────────────────────────────────────────

export const competitiveRooms = pgTable('competitive_rooms', {
	id: uuid('id').defaultRandom().primaryKey(),
	/** Short human-readable code used to join the room (e.g. "ABC123") */
	code: text('code').notNull().unique(),
	/** User who created the room */
	hostId: text('host_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	status: text('status', { enum: ['waiting', 'in_progress', 'finished'] })
		.notNull()
		.default('waiting'),
	difficulty: text('difficulty', {
		enum: ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme']
	}).notNull(),
	gridSize: integer('grid_size').notNull().default(9),
	/** Puzzle given to all participants — hidden until room starts */
	puzzle: jsonb('puzzle'),
	/** Full solution — never sent to clients */
	solution: jsonb('solution'),
	/** Max participants (default 2 for 1v1) */
	maxPlayers: integer('max_players').notNull().default(2),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	startedAt: timestamp('started_at'),
	finishedAt: timestamp('finished_at')
});

export const roomParticipants = pgTable(
	'room_participants',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		roomId: uuid('room_id')
			.notNull()
			.references(() => competitiveRooms.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Snapshot of player grid progress — updated as player types */
		gridState: jsonb('grid_state'),
		/** Seconds elapsed when finished; null = still playing */
		timeSpent: integer('time_spent'),
		hintsUsed: integer('hints_used').notNull().default(0),
		/** Position: 1 = first to finish, null = not yet finished */
		finishPosition: integer('finish_position'),
		/** ELO delta earned in this match (+/-) */
		eloDelta: integer('elo_delta'),
		/** 'active' while playing, 'finished' on solve, 'abandoned' on explicit leave */
		status: text('status', { enum: ['active', 'finished', 'abandoned'] })
			.notNull()
			.default('active'),
		joinedAt: timestamp('joined_at').defaultNow().notNull(),
		finishedAt: timestamp('finished_at'),
		abandonedAt: timestamp('abandoned_at')
	},
	(table) => [
		unique('room_participants_unique').on(table.roomId, table.userId),
		index('room_participants_roomId_idx').on(table.roomId),
		index('room_participants_userId_idx').on(table.userId)
	]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const userStatsRelations = relations(userStats, ({ one }) => ({
	user: one(user, { fields: [userStats.userId], references: [user.id] })
}));

export const gameSessionsRelations = relations(gameSessions, ({ one }) => ({
	user: one(user, { fields: [gameSessions.userId], references: [user.id] })
}));

export const achievementsRelations = relations(achievements, ({ many }) => ({
	userAchievements: many(userAchievements)
}));

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
	user: one(user, { fields: [userAchievements.userId], references: [user.id] }),
	achievement: one(achievements, {
		fields: [userAchievements.achievementId],
		references: [achievements.id]
	})
}));

export const dailyTasksRelations = relations(dailyTasks, ({ many }) => ({
	userDailyTasks: many(userDailyTasks)
}));

export const userDailyTasksRelations = relations(userDailyTasks, ({ one }) => ({
	user: one(user, { fields: [userDailyTasks.userId], references: [user.id] }),
	dailyTask: one(dailyTasks, { fields: [userDailyTasks.dailyTaskId], references: [dailyTasks.id] })
}));

export const storyChaptersRelations = relations(storyChapters, ({ many }) => ({
	puzzles: many(storyPuzzles)
}));

export const storyPuzzlesRelations = relations(storyPuzzles, ({ one, many }) => ({
	chapter: one(storyChapters, { fields: [storyPuzzles.chapterId], references: [storyChapters.id] }),
	progress: many(userStoryProgress)
}));

export const userStoryProgressRelations = relations(userStoryProgress, ({ one }) => ({
	user: one(user, { fields: [userStoryProgress.userId], references: [user.id] }),
	puzzle: one(storyPuzzles, { fields: [userStoryProgress.puzzleId], references: [storyPuzzles.id] })
}));

export const competitiveRoomsRelations = relations(competitiveRooms, ({ one, many }) => ({
	host: one(user, { fields: [competitiveRooms.hostId], references: [user.id] }),
	participants: many(roomParticipants)
}));

export const roomParticipantsRelations = relations(roomParticipants, ({ one }) => ({
	room: one(competitiveRooms, {
		fields: [roomParticipants.roomId],
		references: [competitiveRooms.id]
	}),
	user: one(user, { fields: [roomParticipants.userId], references: [user.id] })
}));

// ─── Crosswords ───────────────────────────────────────────────────────────────

export const crosswords = pgTable('crosswords', {
	id: uuid('id').defaultRandom().primaryKey(),
	/** Human-readable title, e.g. "Space Exploration" */
	title: text('title').notNull(),
	/** Topic used for AI generation, e.g. "history", "science", "movies" */
	topic: text('topic').notNull(),
	/** Language code: "en" | "ru" | "de" | "es" */
	language: text('language').notNull().default('en'),
	/** Difficulty level */
	difficulty: text('difficulty', {
		enum: ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme']
	})
		.notNull()
		.default('medium'),
	/** Width of the grid in cells */
	width: integer('width').notNull().default(15),
	/** Height of the grid in cells */
	height: integer('height').notNull().default(15),
	/**
	 * Full grid layout. Each cell is one of:
	 *  - '#'   = black (blocked) cell
	 *  - letter (A-Z) = the answer letter
	 */
	grid: jsonb('grid').notNull(),
	/**
	 * Clue list. Each entry:
	 * { number, direction: 'across'|'down', clue, answer, row, col, length }
	 */
	clues: jsonb('clues').notNull(),
	/** True when grid+clues were produced by AI */
	aiGenerated: boolean('ai_generated').notNull().default(false),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const crosswordSessions = pgTable(
	'crossword_sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		crosswordId: uuid('crossword_id')
			.notNull()
			.references(() => crosswords.id, { onDelete: 'cascade' }),
		status: text('status', { enum: ['in_progress', 'completed', 'abandoned'] })
			.notNull()
			.default('in_progress'),
		/** Map of "row,col" → letter entered by the player */
		playerGrid: jsonb('player_grid').notNull().default({}),
		/** Seconds elapsed */
		timeSpent: integer('time_spent').notNull().default(0),
		/** Number of reveal-cell hints used */
		hintsUsed: integer('hints_used').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		completedAt: timestamp('completed_at')
	},
	(table) => [
		index('crossword_sessions_userId_idx').on(table.userId),
		index('crossword_sessions_crosswordId_idx').on(table.crosswordId)
	]
);

export const crosswordsRelations = relations(crosswords, ({ many }) => ({
	sessions: many(crosswordSessions)
}));

export const crosswordSessionsRelations = relations(crosswordSessions, ({ one }) => ({
	user: one(user, { fields: [crosswordSessions.userId], references: [user.id] }),
	crossword: one(crosswords, {
		fields: [crosswordSessions.crosswordId],
		references: [crosswords.id]
	})
}));

// ─── Alias / Hat ──────────────────────────────────────────────────────────────

export const aliasRooms = pgTable('alias_rooms', {
	id: uuid('id').defaultRandom().primaryKey(),
	/** 6-char invite code */
	code: text('code').notNull().unique(),
	hostId: text('host_id').references(() => user.id, { onDelete: 'set null' }),
	status: text('status', { enum: ['lobby', 'playing', 'finished'] })
		.notNull()
		.default('lobby'),
	topic: text('topic').notNull(),
	language: text('language').notNull().default('en'),
	difficulty: text('difficulty', {
		enum: ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme']
	})
		.notNull()
		.default('medium'),
	/** Seconds per speaking turn */
	turnDuration: integer('turn_duration').notNull().default(60),
	/** Total words put in the hat */
	wordCount: integer('word_count').notNull().default(30),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const aliasTeams = pgTable(
	'alias_teams',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		roomId: uuid('room_id')
			.notNull()
			.references(() => aliasRooms.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color').notNull().default('#6366f1'),
		score: integer('score').notNull().default(0)
	},
	(table) => [index('alias_teams_roomId_idx').on(table.roomId)]
);

export const aliasTeamMembers = pgTable(
	'alias_team_members',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		teamId: uuid('team_id')
			.notNull()
			.references(() => aliasTeams.id, { onDelete: 'cascade' }),
		roomId: uuid('room_id')
			.notNull()
			.references(() => aliasRooms.id, { onDelete: 'cascade' }),
		/** null for guests */
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		userName: text('user_name').notNull(),
		/** Position in speaker rotation within the team */
		speakerOrder: integer('speaker_order').notNull().default(0)
	},
	(table) => [
		index('alias_team_members_roomId_idx').on(table.roomId),
		index('alias_team_members_teamId_idx').on(table.teamId)
	]
);

export const aliasRoomsRelations = relations(aliasRooms, ({ many }) => ({
	teams: many(aliasTeams)
}));

export const aliasTeamsRelations = relations(aliasTeams, ({ one, many }) => ({
	room: one(aliasRooms, { fields: [aliasTeams.roomId], references: [aliasRooms.id] }),
	members: many(aliasTeamMembers)
}));

export const aliasTeamMembersRelations = relations(aliasTeamMembers, ({ one }) => ({
	team: one(aliasTeams, { fields: [aliasTeamMembers.teamId], references: [aliasTeams.id] }),
	room: one(aliasRooms, { fields: [aliasTeamMembers.roomId], references: [aliasRooms.id] })
}));
