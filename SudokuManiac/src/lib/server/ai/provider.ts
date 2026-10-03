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

/** Default wall-clock budget for one runAi() call, across every provider tried. */
export const DEFAULT_AI_DEADLINE_MS = 25_000;
/** Cap on a single provider attempt, so a hung primary still leaves room to fail over. */
export const DEFAULT_AI_ATTEMPT_MS = 15_000;
/** Don't start an attempt with less than this left — it cannot finish in time. */
const MIN_ATTEMPT_MS = 1_500;

/** Per-attempt options to spread into generateText: `generateText({ model, prompt, ...call })`. */
export interface AiCall {
	abortSignal: AbortSignal;
	maxRetries: number;
}

export interface AiBudget {
	/** Total budget across all providers (ms). */
	deadlineMs?: number;
	/** Cap on any single provider attempt (ms). */
	attemptMs?: number;
}

/**
 * Run an AI call with automatic provider fail-over: try each configured provider
 * in order until one succeeds (e.g. Gemini quota exhausted → Groq → Mistral).
 * Throws the last error only if every provider fails or the budget runs out.
 *
 * The call is bounded in wall-clock time. Without that, one "AI call" had no upper
 * limit: the SDK retries twice by default and sleeps for a provider's `retry-after`
 * (anything under 60 s) before each retry, all inside a single attempt — and that
 * repeated per provider. On serverless the platform then kills the request before
 * any caller fallback can run. So each attempt gets an abort signal for its slice of
 * the budget and `maxRetries: 0`: failing over to the next provider *is* the retry.
 */
export async function runAi<T>(
	fn: (model: LanguageModel, call: AiCall) => Promise<T>,
	{ deadlineMs = DEFAULT_AI_DEADLINE_MS, attemptMs = DEFAULT_AI_ATTEMPT_MS }: AiBudget = {}
): Promise<T> {
	const providers = availableProviders();
	if (!providers.length) throw new Error('No AI provider API key configured');
	const primary = aiProvider();
	const deadline = Date.now() + deadlineMs;
	let lastErr: unknown = new Error(`AI budget of ${deadlineMs}ms exhausted`);

	for (const provider of providers) {
		const remaining = deadline - Date.now();
		if (remaining < MIN_ATTEMPT_MS) {
			console.warn(`[ai] budget exhausted, not trying "${provider}" or later providers`);
			break;
		}
		const slice = Math.min(remaining, attemptMs);
		const controller = new AbortController();
		const timer = setTimeout(
			() => controller.abort(new Error(`AI provider "${provider}" timed out after ${slice}ms`)),
			slice
		);
		try {
			const model = await modelFor(provider, provider === primary);
			return await raceAbort(fn(model, { abortSignal: controller.signal, maxRetries: 0 }), controller.signal);
		} catch (e) {
			lastErr = e;
			console.warn(`[ai] provider "${provider}" failed, trying next:`, (e as Error)?.message ?? e);
		} finally {
			clearTimeout(timer);
		}
	}
	throw lastErr;
}

/**
 * Settle as soon as `signal` aborts, even if the wrapped call ignores the signal —
 * the budget is a guarantee for the caller, not a request to the provider SDK.
 */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		p.then(
			(v) => {
				signal.removeEventListener('abort', onAbort);
				resolve(v);
			},
			(e) => {
				signal.removeEventListener('abort', onAbort);
				reject(e);
			}
		);
	});
}
