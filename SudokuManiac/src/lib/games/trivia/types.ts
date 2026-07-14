/** Shared Trivia types + constants (safe to import on client and server). */

/** Time budget per question, in seconds (drives the UI timer ring + scoring). */
export const QUESTION_SECONDS = 20;

/** Party mode: seconds the correct answer is shown before advancing (reveal window). */
export const REVEAL_SECONDS = 5;

/** A fully-specified question as produced by AI / stored in the DB. */
export interface TriviaQuestion {
	question: string;
	/** Exactly four answer options */
	options: string[];
	/** Index (0–3) of the correct option */
	correctIndex: number;
	/** Shown in the feedback card after answering */
	explanation: string;
}

/** Question shape sent to the client — no answer or explanation revealed. */
export interface ClientQuestion {
	index: number;
	question: string;
	options: string[];
}

/** Per-question grading result returned by the answer endpoint. */
export interface AnswerResult {
	correct: boolean;
	correctIndex: number;
	explanation: string;
	/** Points awarded for this question (0 if wrong) */
	points: number;
	/** Streak after this answer */
	streak: number;
	/** Total score after this answer */
	score: number;
}
