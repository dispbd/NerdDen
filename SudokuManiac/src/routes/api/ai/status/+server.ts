/**
 * AI config check — GET /api/ai/status
 * Reports the selected provider and whether its API key is configured.
 * Does NOT call the provider (no quota spent). Handy for verifying a fresh key.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { aiProvider, availableProviders, hasAnyAiKey } from '$lib/server/ai/provider';

export const GET: RequestHandler = async () => {
	return json({
		provider: aiProvider(),
		keyConfigured: hasAnyAiKey(),
		// Providers tried in order (auto fail-over); primary first, then the rest with keys.
		failoverChain: availableProviders()
	});
};
