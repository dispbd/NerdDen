/**
 * The origin better-auth serves from. Its SvelteKit handler answers /api/auth/* only
 * when the request's origin equals this one, so it must be the address people
 * actually use — not the per-deployment URL.
 *
 * 1. ORIGIN, when set, always wins (custom domains, local dev).
 * 2. A Vercel production deployment uses the project's production domain
 *    (VERCEL_PROJECT_PRODUCTION_URL). VERCEL_URL there is the deployment's own
 *    `<project>-<hash>.vercel.app` address, so with it the auth routes 404 on the
 *    domain everyone visits — social sign-in and session checks break.
 * 3. A preview deployment uses its own URL (VERCEL_URL).
 * 4. Otherwise undefined: better-auth infers it from the request.
 */
export function resolveAuthBaseURL(env: Record<string, string | undefined>): string | undefined {
	const withScheme = (host: string) => (/^https?:\/\//.test(host) ? host : `https://${host}`);
	if (env.ORIGIN) return env.ORIGIN;
	if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) {
		return withScheme(env.VERCEL_PROJECT_PRODUCTION_URL);
	}
	if (env.VERCEL_URL) return withScheme(env.VERCEL_URL);
	return undefined;
}
