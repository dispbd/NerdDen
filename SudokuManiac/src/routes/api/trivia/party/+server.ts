/** POST /api/trivia/party — generate a quiz and open a party room. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { createParty } from '$lib/server/games/trivia/party';

const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];
const LANGUAGES = ['en', 'ru', 'de', 'es'];

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		topic?: string;
		language?: string;
		difficulty?: string;
		count?: number;
		hostName?: string;
		hostToken?: string;
	};

	const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim() : null;
	if (!topic) throw error(400, 'topic is required');
	const hostToken = typeof body.hostToken === 'string' && body.hostToken ? body.hostToken : null;
	if (!hostToken) throw error(400, 'hostToken is required');

	const language = LANGUAGES.includes(body.language ?? '') ? body.language! : 'en';
	const difficulty = DIFFICULTIES.includes(body.difficulty ?? '') ? body.difficulty! : 'medium';
	const count = [5, 10, 20].includes(Number(body.count)) ? Number(body.count) : 10;
	const hostName = (typeof body.hostName === 'string' ? body.hostName.trim() : '') || 'Host';

	const session = await auth.api.getSession({ headers: request.headers });
	const userId = session?.user?.id ?? null;

	const { code } = await createParty(topic, language, difficulty, count, userId, hostName, hostToken);
	return json({ code }, { status: 201 });
};
