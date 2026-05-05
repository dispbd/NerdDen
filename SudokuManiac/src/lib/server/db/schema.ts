import { relations } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';
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

// ─── Relations ────────────────────────────────────────────────────────────────

export const userStatsRelations = relations(userStats, ({ one }) => ({
	user: one(user, { fields: [userStats.userId], references: [user.id] })
}));

export const gameSessionsRelations = relations(gameSessions, ({ one }) => ({
	user: one(user, { fields: [gameSessions.userId], references: [user.id] })
}));
