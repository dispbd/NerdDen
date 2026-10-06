import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Two providers configured: groq (primary) then mistral as fail-over.
vi.mock('$env/dynamic/private', () => ({
	env: { AI_PROVIDER: 'groq', GROQ_API_KEY: 'test-groq', MISTRAL_API_KEY: 'test-mistral' }
}));

const { runAi } = await import('./provider');
type AiCall = import('./provider').AiCall;

/** A provider attempt that never settles — like a hung request or an SDK asleep on retry-after. */
const hang = () => new Promise<never>(() => {});

describe('runAi deadline', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('cuts off a hung provider at attemptMs and fails over to the next one', async () => {
		let calls = 0;
		const p = runAi(
			async () => {
				calls++;
				return calls === 1 ? hang() : 'from-mistral';
			},
			{ deadlineMs: 20_000, attemptMs: 3_000 }
		);
		await vi.advanceTimersByTimeAsync(3_000);
		await expect(p).resolves.toBe('from-mistral');
		expect(calls).toBe(2);
	});

	it('settles by the overall deadline even when every provider hangs', async () => {
		const p = runAi(hang, { deadlineMs: 5_000, attemptMs: 4_000 });
		const settled = p.then(
			() => 'resolved',
			() => 'rejected'
		);
		// groq gets 4s, mistral gets the remaining 1s — under the minimum, so it is skipped.
		await vi.advanceTimersByTimeAsync(5_000);
		await expect(settled).resolves.toBe('rejected');
	});

	it('passes an abort signal and maxRetries: 0 to every attempt', async () => {
		let seen: AiCall | undefined;
		const p = runAi(
			async (_model, call) => {
				seen = call;
				return hang();
			},
			{ deadlineMs: 3_000, attemptMs: 3_000 }
		);
		p.catch(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(seen?.maxRetries).toBe(0);
		// Reasoning models run at their lowest effort (see LOW_REASONING in provider.ts).
		expect(seen?.providerOptions).toMatchObject({
			groq: { reasoningEffort: 'low' },
			google: { thinkingConfig: { thinkingLevel: 'low' } }
		});
		expect(seen?.abortSignal.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(seen?.abortSignal.aborted).toBe(true);
	});

	it('returns the first success without trying further providers', async () => {
		let calls = 0;
		const p = runAi(async () => {
			calls++;
			return 'from-groq';
		});
		await expect(p).resolves.toBe('from-groq');
		expect(calls).toBe(1);
	});

	it('propagates the last error when every provider fails fast', async () => {
		const p = runAi(async () => {
			throw new Error('quota');
		});
		await expect(p).rejects.toThrow('quota');
	});
});

describe('runAi provider restriction', () => {
	const providerOf = (m: unknown) => String((m as { provider?: string }).provider ?? '');

	it('uses only the listed providers, in the listed order', async () => {
		const seen: string[] = [];
		const p = runAi(
			async (model) => {
				seen.push(providerOf(model));
				throw new Error('fail so the next allowed provider is tried');
			},
			{ providers: ['mistral', 'groq'] }
		);
		await expect(p).rejects.toThrow();
		expect(seen).toHaveLength(2);
		expect(seen[0]).toContain('mistral');
		expect(seen[1]).toContain('groq');
	});

	it('skips the configured primary when it is not allowed', async () => {
		let used = '';
		await runAi(
			async (model) => {
				used = providerOf(model);
				return 'ok';
			},
			{ providers: ['mistral'] }
		);
		expect(used).toContain('mistral'); // groq is primary here, but not allowed
	});

	it('fails clearly when no allowed provider has a key', async () => {
		await expect(runAi(async () => 'never', { providers: ['google'] })).rejects.toThrow(
			'No key configured for any of: google'
		);
	});
});
