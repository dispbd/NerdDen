/** POST /api/trivia — generate a quiz and start a session. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { createTriviaGame } from '$lib/server/games/trivia/service';

const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];
const LANGUAGES = ['en', 'ru', 'de', 'es'];

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		topic?: string;
		language?: string;
		difficulty?: string;
		count?: number;
		mode?: string;
	};

	const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim() : null;
	if (!topic) throw error(400, 'topic is required');

	const language = LANGUAGES.includes(body.language ?? '') ? body.language! : 'en';
	const difficulty = DIFFICULTIES.includes(body.difficulty ?? '') ? body.difficulty! : 'medium';
	const count = [5, 10, 20].includes(Number(body.count)) ? Number(body.count) : 10;

	// Party mode is planned for a later phase; only solo is created for now.
	if (body.mode === 'party') throw error(501, 'Party mode is not available yet');

	const session = await auth.api.getSession({ headers: request.headers });
	const userId = session?.user?.id ?? null;

	const { sessionId } = await createTriviaGame(topic, language, difficulty, count, userId);
	return json({ sessionId }, { status: 201 });
};
