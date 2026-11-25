/**
 * Provider constants shared by the app (provider.ts) and the offline evals (evals/).
 * Pure module: no `$env` or other SvelteKit imports, so plain Node scripts can use it.
 */
import type { generateText } from 'ai';

export type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]['providerOptions']>;

export type AiProvider = 'openai' | 'google' | 'anthropic' | 'groq' | 'mistral';

/**
 * Default model per provider. Prefer a provider's moving alias over a pinned version
 * where one exists: pinned ids get retired. Both previous defaults were — Groq dropped
 * llama-3.3-70b-versatile and Google gemini-2.0-flash (gemini-2.5-flash is already
 * closed to new users too) — which silently sent every AI feature to its offline
 * fallback. Groq has no alias; gpt-oss-120b is its general model today.
 */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
	openai: 'gpt-4o-mini',
	google: 'gemini-flash-latest',
	anthropic: 'claude-haiku-4-5-20251001',
	groq: 'openai/gpt-oss-120b',
	mistral: 'mistral-small-latest'
};

/**
 * Every task here (questions, words, clues, hints, drawings) is short and simple, so
 * reasoning models run at their lowest effort. Measured on a 5-question trivia request:
 * Groq gpt-oss-120b 2.1 s → 1.5 s; Gemini flash-latest 48 s at its default thinking →
 * 5.3 s at "low". Reasoning also draws on the same output-token cap as the answer, so
 * this keeps tight caps from emptying replies. Keyed per provider; others ignore it.
 */
export const LOW_REASONING: ProviderOptions = {
	groq: { reasoningEffort: 'low' },
	google: { thinkingConfig: { thinkingLevel: 'low' } },
	openai: { reasoningEffort: 'low' }
};

export const KEY_ENV: Record<AiProvider, string> = {
	openai: 'OPENAI_API_KEY',
	google: 'GOOGLE_GENERATIVE_AI_API_KEY',
	anthropic: 'ANTHROPIC_API_KEY',
	groq: 'GROQ_API_KEY',
	mistral: 'MISTRAL_API_KEY'
};
