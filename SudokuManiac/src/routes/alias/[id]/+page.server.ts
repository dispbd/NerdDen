import { getRoomWithTeams } from '$lib/server/alias/rooms';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const room = await getRoomWithTeams(params.id);
	if (!room) throw error(404, 'Room not found');

	return {
		room,
		currentUserId: locals.user?.id ?? null,
		currentUserName: locals.user?.name ?? 'Guest'
	};
};
