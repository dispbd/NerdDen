import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRoom, listOpenRooms } from '$lib/server/alias/rooms';
import { auth } from '$lib/server/auth';

/** GET /api/alias — list open lobby rooms */
export const GET: RequestHandler = async () => {
	const rooms = await listOpenRooms();
	return json(rooms);
};

/** POST /api/alias — create a new room */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));

	const topic = typeof body?.topic === 'string' && body.topic.trim() ? body.topic.trim() : null;
	if (!topic) throw error(400, 'topic is required');

	const session = await auth.api.getSession({ headers: request.headers });
	const userId = session?.user?.id ?? null;
	const userName = session?.user?.name ?? 'Guest';

	const allowed = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];
	const difficulty =
		typeof body?.difficulty === 'string' && allowed.includes(body.difficulty)
			? body.difficulty
			: 'medium';

	const language = typeof body?.language === 'string' ? body.language : 'en';
	const turnDuration = Number(body?.turnDuration ?? 60);
	const wordCount = Math.min(Math.max(Number(body?.wordCount ?? 30), 10), 100);

	const room = await createRoom({ hostId: userId, hostName: userName, topic, language, difficulty, turnDuration, wordCount });
	return json(room, { status: 201 });
};
