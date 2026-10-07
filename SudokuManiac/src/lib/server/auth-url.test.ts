import { describe, expect, it } from 'vitest';
import { resolveAuthBaseURL } from './auth-url';

describe('resolveAuthBaseURL', () => {
	it('prefers an explicit ORIGIN everywhere', () => {
		expect(
			resolveAuthBaseURL({
				ORIGIN: 'https://nerdden.example',
				VERCEL_ENV: 'production',
				VERCEL_PROJECT_PRODUCTION_URL: 'nerd-den.vercel.app',
				VERCEL_URL: 'nerd-abc123-nerd-den.vercel.app'
			})
		).toBe('https://nerdden.example');
	});

	it('uses the production domain, not the deployment URL, in production', () => {
		expect(
			resolveAuthBaseURL({
				VERCEL_ENV: 'production',
				VERCEL_PROJECT_PRODUCTION_URL: 'nerd-den.vercel.app',
				VERCEL_URL: 'nerd-abc123-nerd-den.vercel.app'
			})
		).toBe('https://nerd-den.vercel.app');
	});

	it('uses the deployment URL for previews', () => {
		expect(
			resolveAuthBaseURL({
				VERCEL_ENV: 'preview',
				VERCEL_PROJECT_PRODUCTION_URL: 'nerd-den.vercel.app',
				VERCEL_URL: 'nerd-abc123-nerd-den.vercel.app'
			})
		).toBe('https://nerd-abc123-nerd-den.vercel.app');
	});

	it('keeps a scheme that is already there, and infers when nothing is set', () => {
		expect(resolveAuthBaseURL({ VERCEL_URL: 'http://localhost:3000' })).toBe(
			'http://localhost:3000'
		);
		expect(resolveAuthBaseURL({})).toBeUndefined();
	});
});
