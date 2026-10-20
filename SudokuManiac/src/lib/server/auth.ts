import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { resolveAuthBaseURL } from './auth-url';

// On Vercel production this must be the production domain — see auth-url.ts.
const baseURL = resolveAuthBaseURL({
	ORIGIN: env.ORIGIN,
	VERCEL_ENV: process.env['VERCEL_ENV'],
	VERCEL_PROJECT_PRODUCTION_URL: process.env['VERCEL_PROJECT_PRODUCTION_URL'],
	VERCEL_URL: process.env['VERCEL_URL']
});

export const auth = betterAuth({
	baseURL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	socialProviders: {
		github: {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET
		},
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
