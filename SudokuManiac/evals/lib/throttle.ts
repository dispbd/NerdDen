/**
 * Per-model throttle with retries on rate limits, overload and timeouts.
 * Free-tier limits apply per model, so each model gets its own call schedule.
 */
import type { EvalModel } from './models.ts';

const nextSlot = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function throttled<T>(m: EvalModel, fn: () => Promise<T>): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		const wait = (nextSlot.get(m.name) ?? 0) - Date.now();
		nextSlot.set(m.name, Math.max(Date.now(), nextSlot.get(m.name) ?? 0) + m.minIntervalMs);
		if (wait > 0) await sleep(wait);
		try {
			return await fn();
		} catch (e) {
			const err = e as { statusCode?: number; responseHeaders?: Record<string, string>; message?: string; lastError?: unknown };
			const inner = (err.lastError ?? err) as typeof err;
			const status = inner.statusCode;
			const limited =
				status === 429 || status === 503 || /rate|quota|overloaded|too many|high demand|timeout/i.test(inner.message ?? '');
			if (!limited || attempt >= 5) throw e;
			const retryAfter = Number(inner.responseHeaders?.['retry-after']);
			const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 + 500 : 15_000 * attempt;
			console.warn(`  [${m.name}] ${status ?? inner.message?.slice(0, 40)}, retry ${attempt} in ${Math.round(delay / 1000)}s`);
			nextSlot.set(m.name, Date.now() + delay);
		}
	}
}
