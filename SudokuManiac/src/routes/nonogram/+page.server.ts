import { listNonograms } from '$lib/server/games/nonogram/service';
import { getLocale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { items: await listNonograms(locals.user?.id ?? null, getLocale()) };
};
