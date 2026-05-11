import { listOpenRooms } from '$lib/server/alias/rooms';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const openRooms = await listOpenRooms();
	return { openRooms };
};
