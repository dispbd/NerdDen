/**
 * Trivia storage + game service.
 *
 * Answers (`correctIndex`) and explanations live only in the DB and are never
 * included in the client payload — grading happens here on the server, mirroring
 * the crossword "answers stripped" approach.
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { triviaSets, triviaQuestions, triviaSessions, userStats } from '$lib/server/db/schema';
import { generateTriviaQuestions } from '$lib/server/ai/trivia';
import { scoreAnswer } from './score';
import type { ClientQuestion, AnswerResult } from '$lib/games/trivia/types';

type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme';

interface AnswerLog {
	index: number;
	chosen: number;
	correct: boolean;
	points: number;
	msLeft: number;
}

/** Data handed to the play page — questions with answers stripped. */
export interface TriviaClientData {
	sessionId: string;
	set: {
		id: string;
		title: string;
		topic: string;
		language: string;
		difficulty: string;
		questionCount: number;
	};
	questions: ClientQuestion[];
	session: {
		status: 'in_progress' | 'completed' | 'abandoned';
		currentIndex: number;
		score: number;
		correctCount: number;
		currentStreak: number;
		bestStreak: number;
	};
}

/**
 * Generate a quiz and start a session for it.
 * Returns the new session id (the id used in the /trivia/[id] route).
 */
export async function createTriviaGame(
	topic: string,
	language: string,
	difficulty: string,
	count: number,
	userId: string | null
): Promise<{ sessionId: string; setId: string }> {
	const questions = await generateTriviaQuestions(topic, language, difficulty, count);
	const aiGenerated = questions.length > 0;

	const title = `${topic.charAt(0).toUpperCase() + topic.slice(1)} Quiz`;

	const [set] = await db
		.insert(triviaSets)
		.values({
			title,
			topic,
			language,
			difficulty: difficulty as Difficulty,
			questionCount: questions.length,
			aiGenerated
		})
		.returning({ id: triviaSets.id });

	await db.insert(triviaQuestions).values(
		questions.map((q, i) => ({
			setId: set.id,
			orderIndex: i,
			question: q.question,
			options: q.options,
			correctIndex: q.correctIndex,
			explanation: q.explanation
		}))
	);

	const [session] = await db
		.insert(triviaSessions)
		.values({ setId: set.id, userId })
		.returning({ id: triviaSessions.id });

	return { sessionId: session.id, setId: set.id };
}

/** Load a session + its set with questions (answers stripped) for the client. */
export async function getTriviaClientData(sessionId: string): Promise<TriviaClientData | null> {
	const [session] = await db
		.select()
		.from(triviaSessions)
		.where(eq(triviaSessions.id, sessionId));
	if (!session) return null;

	const [set] = await db.select().from(triviaSets).where(eq(triviaSets.id, session.setId));
	if (!set) return null;

	const rows = await db
		.select({
			orderIndex: triviaQuestions.orderIndex,
			question: triviaQuestions.question,
			options: triviaQuestions.options
		})
		.from(triviaQuestions)
		.where(eq(triviaQuestions.setId, set.id))
		.orderBy(asc(triviaQuestions.orderIndex));

	return {
		sessionId: session.id,
		set: {
			id: set.id,
			title: set.title,
			topic: set.topic,
			language: set.language,
			difficulty: set.difficulty,
			questionCount: set.questionCount
		},
		questions: rows.map((r) => ({
			index: r.orderIndex,
			question: r.question,
			options: r.options as string[]
		})),
		session: {
			status: session.status,
			currentIndex: session.currentIndex,
			score: session.score,
			correctCount: session.correctCount,
			currentStreak: session.currentStreak,
			bestStreak: session.bestStreak
		}
	};
}

/**
 * Grade one answer, advance the session, and return the result.
 * Enforces in-order answering to prevent replay / skipping.
 */
export async function submitAnswer(
	sessionId: string,
	index: number,
	chosen: number,
	msLeft: number
): Promise<AnswerResult | { error: string }> {
	const [session] = await db
		.select()
		.from(triviaSessions)
		.where(eq(triviaSessions.id, sessionId));
	if (!session) return { error: 'not_found' };
	if (session.status !== 'in_progress') return { error: 'not_in_progress' };
	if (index !== session.currentIndex) return { error: 'out_of_order' };

	const [question] = await db
		.select()
		.from(triviaQuestions)
		.where(
			and(eq(triviaQuestions.setId, session.setId), eq(triviaQuestions.orderIndex, index))
		);
	if (!question) return { error: 'no_question' };

	const correct = chosen === question.correctIndex;
	const { points, streakAfter } = scoreAnswer(correct, msLeft, session.currentStreak);

	const answers = [...((session.answers as AnswerLog[]) ?? [])];
	answers.push({ index, chosen, correct, points, msLeft });

	const bestStreak = Math.max(session.bestStreak, streakAfter);
	const nextIndex = index + 1;
	const score = session.score + points;
	const correctCount = session.correctCount + (correct ? 1 : 0);

	await db
		.update(triviaSessions)
		.set({
			answers,
			currentIndex: nextIndex,
			currentStreak: streakAfter,
			bestStreak,
			score,
			correctCount
		})
		.where(eq(triviaSessions.id, sessionId));

	return {
		correct,
		correctIndex: question.correctIndex,
		explanation: question.explanation,
		points,
		streak: streakAfter,
		score
	};
}

export interface TriviaSummary {
	score: number;
	correctCount: number;
	questionCount: number;
	bestStreak: number;
	xpEarned: number;
}

/** Finalize a session: mark completed, award XP, return the result summary. */
export async function completeTriviaGame(
	sessionId: string,
	timeSpent: number
): Promise<TriviaSummary | null> {
	const [session] = await db
		.select()
		.from(triviaSessions)
		.where(eq(triviaSessions.id, sessionId));
	if (!session) return null;

	const [set] = await db.select().from(triviaSets).where(eq(triviaSets.id, session.setId));
	const questionCount = set?.questionCount ?? session.currentIndex;

	// XP: 10 per correct answer + a small bonus for a flawless run.
	const flawless = session.correctCount === questionCount && questionCount > 0;
	const xpEarned = session.correctCount * 10 + (flawless ? 20 : 0);

	if (session.status === 'in_progress') {
		await db
			.update(triviaSessions)
			.set({
				status: 'completed',
				completedAt: new Date(),
				timeSpent: Math.max(0, Math.floor(timeSpent) || 0)
			})
			.where(eq(triviaSessions.id, sessionId));

		// Credit XP to the signed-in player's stats (guests are skipped).
		if (session.userId) {
			const [stats] = await db
				.select({ totalXp: userStats.totalXp })
				.from(userStats)
				.where(eq(userStats.userId, session.userId));
			if (stats) {
				await db
					.update(userStats)
					.set({ totalXp: stats.totalXp + xpEarned })
					.where(eq(userStats.userId, session.userId));
			}
		}
	}

	return {
		score: session.score,
		correctCount: session.correctCount,
		questionCount,
		bestStreak: session.bestStreak,
		xpEarned
	};
}
