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
 * Only `@ai-sdk/openai` ships in package.json. To use another provider, install it:
 *   pnpm add @ai-sdk/google      # Gemini (has a free tier)
 *   pnpm add @ai-sdk/groq        # Groq   (free tier, fast)
 *   pnpm add @ai-sdk/anthropic   # Claude (paid)
 *   pnpm add @ai-sdk/mistral     # Mistral (free tier)
 * The dynamic imports below are marked @vite-ignore so an uninstalled provider only
 * errors if it is actually selected — the build never breaks.
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

export function aiProvider(): AiProvider {
	const p = (env.AI_PROVIDER ?? 'openai') as AiProvider;
	return p in DEFAULT_MODEL ? p : 'openai';
}

/** True when the selected provider has its API key configured. */
export function hasAiKey(): boolean {
	return !!env[KEY_ENV[aiProvider()]];
}

/** Resolve the configured provider + model into an AI SDK LanguageModel. */
export async function aiModel(): Promise<LanguageModel> {
	const provider = aiProvider();
	const model = env.AI_MODEL || DEFAULT_MODEL[provider];
	const apiKey = env[KEY_ENV[provider]];

	switch (provider) {
		case 'openai': {
			const { createOpenAI } = await import('@ai-sdk/openai');
			return createOpenAI({ apiKey })(model);
		}
		case 'google': {
			// @ts-ignore optional dependency — install @ai-sdk/google to use
			const { createGoogleGenerativeAI } = await import(/* @vite-ignore */ '@ai-sdk/google');
			return createGoogleGenerativeAI({ apiKey })(model);
		}
		case 'anthropic': {
			// @ts-ignore optional dependency — install @ai-sdk/anthropic to use
			const { createAnthropic } = await import(/* @vite-ignore */ '@ai-sdk/anthropic');
			return createAnthropic({ apiKey })(model);
		}
		case 'groq': {
			// @ts-ignore optional dependency — install @ai-sdk/groq to use
			const { createGroq } = await import(/* @vite-ignore */ '@ai-sdk/groq');
			return createGroq({ apiKey })(model);
		}
		case 'mistral': {
			// @ts-ignore optional dependency — install @ai-sdk/mistral to use
			const { createMistral } = await import(/* @vite-ignore */ '@ai-sdk/mistral');
			return createMistral({ apiKey })(model);
		}
	}
}
