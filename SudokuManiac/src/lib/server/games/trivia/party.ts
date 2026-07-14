/**
 * Trivia Party — multiplayer over DB polling (no WebSockets; the app deploys on
 * adapter-vercel / serverless). Clients poll getPartyState(); the shared question
 * timeline is advanced *lazily* here on each poll/answer, so no background job is
 * needed. Players are identified by a client-generated token (guests allowed).
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { triviaParties, triviaPartyPlayers, triviaQuestions, triviaSets } from '$lib/server/db/schema';
import { createSetWithQuestions } from './service';
import { scoreAnswer } from './score';
import { QUESTION_SECONDS, REVEAL_SECONDS } from '$lib/games/trivia/types';
import type { PartyState, PartyPhase, ClientQuestion } from '$lib/games/trivia/types';

const ANSWER_MS = QUESTION_SECONDS * 1000;
const REVEAL_MS = REVEAL_SECONDS * 1000;
const CYCLE_MS = ANSWER_MS + REVEAL_MS;
/** Latency grace so an answer sent right at the buzzer still counts. */
const GRACE_MS = 1000;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars

type PartyRow = typeof triviaParties.$inferSelect;

function randomCode(): string {
	let s = '';
	for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	return s;
}

/** Create a party (generates the quiz) and add the host as the first player. */
export async function createParty(
	topic: string,
	language: string,
	difficulty: string,
	count: number,
	userId: string | null,
	hostName: string,
	hostToken: string
): Promise<{ code: string }> {
	const { setId, questionCount } = await createSetWithQuestions(topic, language, difficulty, count);

	// Find an unused code (a few tries is plenty at this scale).
	let code = randomCode();
	for (let i = 0; i < 5; i++) {
		const [existing] = await db
			.select({ id: triviaParties.id })
			.from(triviaParties)
			.where(eq(triviaParties.code, code));
		if (!existing) break;
		code = randomCode();
	}

	const [party] = await db
		.insert(triviaParties)
		.values({ code, setId, questionCount })
		.returning({ id: triviaParties.id });

	await db.insert(triviaPartyPlayers).values({
		partyId: party.id,
		token: hostToken,
		userId,
		name: hostName.slice(0, 24) || 'Host',
		isHost: true
	});

	return { code };
}

/** Add a player to a party's lobby (idempotent on token). */
export async function joinParty(
	code: string,
	name: string,
	token: string,
	userId: string | null
): Promise<{ ok: true } | { error: string }> {
	const party = await loadAndAdvance(code);
	if (!party) return { error: 'not_found' };
	if (party.status !== 'lobby') return { error: 'already_started' };

	const [existing] = await db
		.select({ id: triviaPartyPlayers.id })
		.from(triviaPartyPlayers)
		.where(and(eq(triviaPartyPlayers.partyId, party.id), eq(triviaPartyPlayers.token, token)));
	if (existing) return { ok: true };

	await db.insert(triviaPartyPlayers).values({
		partyId: party.id,
		token,
		userId,
		name: name.slice(0, 24) || 'Player'
	});
	return { ok: true };
}

/** Host starts the game: lobby → playing, question 0 window opens now. */
export async function startParty(
	code: string,
	token: string
): Promise<{ ok: true } | { error: string }> {
	const [party] = await db.select().from(triviaParties).where(eq(triviaParties.code, code));
	if (!party) return { error: 'not_found' };
	if (party.status !== 'lobby') return { error: 'already_started' };

	const [player] = await db
		.select({ isHost: triviaPartyPlayers.isHost })
		.from(triviaPartyPlayers)
		.where(and(eq(triviaPartyPlayers.partyId, party.id), eq(triviaPartyPlayers.token, token)));
	if (!player?.isHost) return { error: 'not_host' };

	await db
		.update(triviaParties)
		.set({ status: 'playing', currentIndex: 0, questionStartedAt: new Date() })
		.where(eq(triviaParties.id, party.id));
	return { ok: true };
}

/**
 * Load a party by code and advance its timeline if due, persisting any change.
 * Returns the fresh row (post-advance) or null.
 */
async function loadAndAdvance(code: string): Promise<PartyRow | null> {
	const [party] = await db.select().from(triviaParties).where(eq(triviaParties.code, code));
	if (!party) return null;
	if (party.status !== 'playing' || !party.questionStartedAt) return party;

	let currentIndex = party.currentIndex;
	let startedMs = party.questionStartedAt.getTime();
	let status: PartyRow['status'] = party.status;
	const now = Date.now();

	while (now - startedMs >= CYCLE_MS) {
		if (currentIndex + 1 >= party.questionCount) {
			status = 'finished';
			break;
		}
		currentIndex += 1;
		startedMs += CYCLE_MS;
	}

	if (status !== party.status || currentIndex !== party.currentIndex) {
		const questionStartedAt = status === 'finished' ? null : new Date(startedMs);
		await db
			.update(triviaParties)
			.set({ status, currentIndex, questionStartedAt })
			.where(eq(triviaParties.id, party.id));
		return { ...party, status, currentIndex, questionStartedAt };
	}
	return party;
}

function phaseOf(party: PartyRow, now: number): PartyPhase {
	if (party.status === 'lobby') return 'lobby';
	if (party.status === 'finished') return 'finished';
	const started = party.questionStartedAt?.getTime() ?? now;
	return now - started < ANSWER_MS ? 'answering' : 'reveal';
}

/** Poll: full party state for the client. Answers are hidden until reveal. */
export async function getPartyState(code: string, token?: string): Promise<PartyState | null> {
	const party = await loadAndAdvance(code);
	if (!party) return null;

	const [set] = await db.select().from(triviaSets).where(eq(triviaSets.id, party.setId));
	const players = await db
		.select()
		.from(triviaPartyPlayers)
		.where(eq(triviaPartyPlayers.partyId, party.id))
		.orderBy(asc(triviaPartyPlayers.joinedAt));

	const now = Date.now();
	const phase = phaseOf(party, now);

	// Current question (answer stripped) + correctIndex (only revealed post-answer).
	let question: ClientQuestion | null = null;
	let correctIndex: number | null = null;
	if (party.status === 'playing') {
		const [q] = await db
			.select()
			.from(triviaQuestions)
			.where(
				and(
					eq(triviaQuestions.setId, party.setId),
					eq(triviaQuestions.orderIndex, party.currentIndex)
				)
			);
		if (q) {
			question = { index: q.orderIndex, question: q.question, options: q.options as string[] };
			if (phase === 'reveal') correctIndex = q.correctIndex;
		}
	}

	const me = token ? players.find((p) => p.token === token) : undefined;

	return {
		code: party.code,
		status: party.status,
		phase,
		topic: set?.topic ?? '',
		difficulty: set?.difficulty ?? 'medium',
		questionCount: party.questionCount,
		currentIndex: party.currentIndex,
		serverNow: now,
		questionStartedAt: party.questionStartedAt?.getTime() ?? null,
		answerMs: ANSWER_MS,
		revealMs: REVEAL_MS,
		question,
		correctIndex,
		players: players.map((p) => ({
			name: p.name,
			score: p.score,
			correctCount: p.correctCount,
			bestStreak: p.bestStreak,
			isHost: p.isHost,
			answeredCurrent: p.lastAnsweredIndex >= party.currentIndex,
			isMe: !!me && p.id === me.id
		})),
		me: {
			joined: !!me,
			isHost: !!me?.isHost,
			answeredCurrent: !!me && me.lastAnsweredIndex >= party.currentIndex
		}
	};
}

/** Grade a player's answer for the current question. Returns { ok } (correctness
 *  is revealed to everyone during the reveal phase, not here). */
export async function submitPartyAnswer(
	code: string,
	token: string,
	index: number,
	chosen: number,
	msLeft: number
): Promise<{ ok: true } | { error: string }> {
	const party = await loadAndAdvance(code);
	if (!party) return { error: 'not_found' };
	if (party.status !== 'playing') return { error: 'not_playing' };
	if (index !== party.currentIndex) return { error: 'wrong_question' };

	const now = Date.now();
	const started = party.questionStartedAt?.getTime() ?? now;
	if (now - started > ANSWER_MS + GRACE_MS) return { error: 'too_late' };

	const [player] = await db
		.select()
		.from(triviaPartyPlayers)
		.where(and(eq(triviaPartyPlayers.partyId, party.id), eq(triviaPartyPlayers.token, token)));
	if (!player) return { error: 'not_a_player' };
	if (player.lastAnsweredIndex >= index) return { error: 'already_answered' };

	const [q] = await db
		.select({ correctIndex: triviaQuestions.correctIndex })
		.from(triviaQuestions)
		.where(and(eq(triviaQuestions.setId, party.setId), eq(triviaQuestions.orderIndex, index)));
	if (!q) return { error: 'no_question' };

	const correct = chosen === q.correctIndex;
	const { points, streakAfter } = scoreAnswer(correct, msLeft, player.currentStreak);

	await db
		.update(triviaPartyPlayers)
		.set({
			score: player.score + points,
			correctCount: player.correctCount + (correct ? 1 : 0),
			currentStreak: streakAfter,
			bestStreak: Math.max(player.bestStreak, streakAfter),
			lastAnsweredIndex: index
		})
		.where(eq(triviaPartyPlayers.id, player.id));

	return { ok: true };
}
