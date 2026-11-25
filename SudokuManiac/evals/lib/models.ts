/**
 * Models for the evals. Built directly per provider (no fail-over): a comparison
 * must know which model answered. Same defaults and reasoning settings as the app.
 */
import type { LanguageModel } from 'ai';
import { DEFAULT_MODEL, KEY_ENV, LOW_REASONING, type AiProvider } from '../../src/lib/server/ai/config.ts';

try {
	process.loadEnvFile('.env');
} catch {
	// keys may come from the shell instead
}

export { LOW_REASONING };

export interface EvalModel {
	provider: AiProvider;
	modelId: string;
	/** "provider:model" — the key used in results */
	name: string;
	model: LanguageModel;
	/** Minimum gap between two calls, to stay under free-tier limits. */
	minIntervalMs: number;
}

/**
 * Free tiers this project runs on; limits apply per model. Groq reserves the whole
 * max_tokens against its 8,000 tokens-per-minute limit, so a 2,500-token hint call
 * allows ~3 calls a minute.
 */
const MIN_INTERVAL: Partial<Record<AiProvider, number>> = { groq: 22_000, google: 7_000, mistral: 1_200 };

/** Accepts "groq", "google", "mistral" or "provider:model-id". */
export async function evalModel(spec: string, minIntervalMs?: number): Promise<EvalModel> {
	const [provider, ...rest] = spec.split(':') as [AiProvider, ...string[]];
	const modelId = rest.join(':') || DEFAULT_MODEL[provider];
	const apiKey = process.env[KEY_ENV[provider]];
	if (!apiKey) throw new Error(`${KEY_ENV[provider]} is not set`);

	let model: LanguageModel;
	switch (provider) {
		case 'groq':
			model = (await import('@ai-sdk/groq')).createGroq({ apiKey })(modelId);
			break;
		case 'google':
			model = (await import('@ai-sdk/google')).createGoogleGenerativeAI({ apiKey })(modelId);
			break;
		case 'mistral':
			model = (await import('@ai-sdk/mistral')).createMistral({ apiKey })(modelId);
			break;
		case 'openai':
			model = (await import('@ai-sdk/openai')).createOpenAI({ apiKey })(modelId);
			break;
		default:
			throw new Error(`provider "${provider}" is not wired into the evals`);
	}
	return { provider, modelId, name: `${provider}:${modelId}`, model, minIntervalMs: minIntervalMs ?? MIN_INTERVAL[provider] ?? 1_000 };
}
