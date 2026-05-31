import type { PageServerLoad } from './$types';

/** Competitive mode is available to everyone — guests and authenticated users. */
export const load: PageServerLoad = async ({ locals }) => {
	return { user: locals.user ?? null };
};
