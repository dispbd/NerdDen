import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/profile');
	return {};
};

export const actions: Actions = {
	email: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');

		if (!email || !password) return fail(400, { error: 'Email and password are required.' });

		try {
			await auth.api.signInEmail({ body: { email, password } });
		} catch {
			return fail(401, { error: 'Invalid email or password.' });
		}

		redirect(303, '/profile');
	}
};
