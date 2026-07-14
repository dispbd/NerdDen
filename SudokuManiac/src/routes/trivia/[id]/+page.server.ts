import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTriviaClientData } from '$lib/server/games/trivia/service';

export const load: PageServerLoad = async ({ params }) => {
	const data = await getTriviaClientData(params.id);
	if (!data) throw error(404, 'Quiz not found');
	return data;
};
