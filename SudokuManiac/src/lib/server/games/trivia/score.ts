/**
 * Server-authoritative trivia scoring.
 *
 * Per correct answer: a base score plus a speed bonus (by fraction of the timer
 * left), multiplied by a streak multiplier. Wrong answers score 0 and reset the
 * streak. The client only reports the remaining time; the server clamps it to the
 * known question duration so it can't be gamed.
 */

import { QUESTION_SECONDS } from '$lib/games/trivia/types';

const QUESTION_MS = QUESTION_SECONDS * 1000;

const BASE = 50;
const MAX_TIME_BONUS = 40;
/** Multiplier grows +0.1 per prior correct answer, capped so runs land ~700–860. */
const MULTIPLIER_STEP = 0.1;
const MAX_MULTIPLIER = 1.6;

export interface ScoreResult {
	/** Points awarded (0 if wrong) */
	points: number;
	/** Streak count after this answer */
	streakAfter: number;
}

/**
 * @param correct     whether the chosen option was right
 * @param msLeft      milliseconds remaining on the timer when answered
 * @param streakBefore consecutive correct answers entering this question
 */
export function scoreAnswer(correct: boolean, msLeft: number, streakBefore: number): ScoreResult {
	if (!correct) return { points: 0, streakAfter: 0 };

	const clamped = Math.max(0, Math.min(QUESTION_MS, Number.isFinite(msLeft) ? msLeft : 0));
	const timeBonus = Math.round(MAX_TIME_BONUS * (clamped / QUESTION_MS));
	const multiplier = Math.min(1 + streakBefore * MULTIPLIER_STEP, MAX_MULTIPLIER);
	const points = Math.round((BASE + timeBonus) * multiplier);

	return { points, streakAfter: streakBefore + 1 };
}
