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
		const name = String(form.get('name') ?? '');
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');

		if (!name || !email || !password) return fail(400, { error: 'All fields are required.' });
		if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters.' });

		try {
			await auth.api.signUpEmail({ body: { name, email, password } });
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'Registration failed.';
			return fail(400, { error: message });
		}

		redirect(303, '/profile');
	}
};
