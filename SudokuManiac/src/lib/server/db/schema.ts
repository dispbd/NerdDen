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
		/** Full solution grid */
		solution: jsonb('solution').notNull(),
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
