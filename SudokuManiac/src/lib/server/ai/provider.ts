/**
 * Central AI provider selector for the Vercel AI SDK.
 *
 * Switch providers via env — no code changes in call sites:
 *   AI_PROVIDER = openai | google | anthropic | groq | mistral   (default: openai)
 *   AI_MODEL    = <model id>                                      (optional override)
 *
 * Per-provider API key env:
 *   OPENAI_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY | ANTHROPIC_API_KEY |
 *   GROQ_API_KEY   | MISTRAL_API_KEY
 *
 * Bundled providers: openai, google (Gemini — free tier), groq (free tier, fast),
 * mistral (free tier). `anthropic` (paid) is optional — install `@ai-sdk/anthropic`
 * to enable it; its import is @vite-ignore'd so the build never breaks without it.
 *
 * Free-tier keys:
 *   Gemini  → https://aistudio.google.com/apikey        (GOOGLE_GENERATIVE_AI_API_KEY)
 *   Groq    → https://console.groq.com/keys             (GROQ_API_KEY)
 *   Mistral → https://console.mistral.ai/api-keys       (MISTRAL_API_KEY)
 */
import { env } from '$env/dynamic/private';
import type { LanguageModel } from 'ai';

export type AiProvider = 'openai' | 'google' | 'anthropic' | 'groq' | 'mistral';

const DEFAULT_MODEL: Record<AiProvider, string> = {
	openai: 'gpt-4o-mini',
	google: 'gemini-2.0-flash',
	anthropic: 'claude-haiku-4-5-20251001',
	groq: 'llama-3.3-70b-versatile',
	mistral: 'mistral-small-latest'
};

const KEY_ENV: Record<AiProvider, string> = {
	openai: 'OPENAI_API_KEY',
	google: 'GOOGLE_GENERATIVE_AI_API_KEY',
	anthropic: 'ANTHROPIC_API_KEY',
	groq: 'GROQ_API_KEY',
	mistral: 'MISTRAL_API_KEY'
};

/**
 * Parse a JSON object out of a model's text reply. Provider/model support for
 * structured output (json_schema) varies, so generators use generateText + this
 * helper instead of generateObject — works on every provider. Strips ``` fences
 * and any prose around the first {...} block. Throws if no valid JSON is found.
 */
export function parseJsonFromText(text: string): unknown {
	const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
	const start = cleaned.indexOf('{');
	const end = cleaned.lastIndexOf('}');
	const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
	return JSON.parse(slice);
}

export function aiProvider(): AiProvider {
	const p = (env.AI_PROVIDER ?? 'openai') as AiProvider;
	return p in DEFAULT_MODEL ? p : 'openai';
}

/** True when the selected provider has its API key configured. */
export function hasAiKey(): boolean {
	return !!env[KEY_ENV[aiProvider()]];
}

/** Build a LanguageModel for a specific provider. AI_MODEL only overrides the
 *  primary provider (allowOverride) — fallbacks use their own default model. */
async function modelFor(provider: AiProvider, allowOverride: boolean): Promise<LanguageModel> {
	const model = (allowOverride && env.AI_MODEL) || DEFAULT_MODEL[provider];
	const apiKey = env[KEY_ENV[provider]];

	switch (provider) {
		case 'openai': {
			const { createOpenAI } = await import('@ai-sdk/openai');
			return createOpenAI({ apiKey })(model);
		}
		case 'google': {
			const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
			return createGoogleGenerativeAI({ apiKey })(model);
		}
		case 'anthropic': {
			// Optional (paid) — install @ai-sdk/anthropic to enable; kept out of the bundle.
			// @ts-ignore optional dependency
			const { createAnthropic } = await import(/* @vite-ignore */ '@ai-sdk/anthropic');
			return createAnthropic({ apiKey })(model);
		}
		case 'groq': {
			const { createGroq } = await import('@ai-sdk/groq');
			return createGroq({ apiKey })(model);
		}
		case 'mistral': {
			const { createMistral } = await import('@ai-sdk/mistral');
			return createMistral({ apiKey })(model);
		}
	}
}

/** Resolve the primary configured provider + model into a LanguageModel. */
export async function aiModel(): Promise<LanguageModel> {
	return modelFor(aiProvider(), true);
}

/** Fail-over order: the configured provider first, then the rest (free-first). */
const FREE_FIRST: AiProvider[] = ['groq', 'google', 'mistral', 'openai', 'anthropic'];

/** Configured providers (those with an API key), primary first. */
export function availableProviders(): AiProvider[] {
	const primary = aiProvider();
	return [primary, ...FREE_FIRST.filter((p) => p !== primary)].filter((p) => !!env[KEY_ENV[p]]);
}

/** True when at least one provider has a key configured. */
export function hasAnyAiKey(): boolean {
	return availableProviders().length > 0;
}

/**
 * Run an AI call with automatic provider fail-over: try each configured provider
 * in order until one succeeds (e.g. Gemini quota exhausted → Groq → Mistral).
 * Throws the last error only if every provider fails.
 */
export async function runAi<T>(fn: (model: LanguageModel) => Promise<T>): Promise<T> {
	const providers = availableProviders();
	if (!providers.length) throw new Error('No AI provider API key configured');
	const primary = aiProvider();
	let lastErr: unknown;
	for (const provider of providers) {
		try {
			return await fn(await modelFor(provider, provider === primary));
		} catch (e) {
			lastErr = e;
			console.warn(`[ai] provider "${provider}" failed, trying next:`, (e as Error)?.message ?? e);
		}
	}
	throw lastErr;
}
