import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Two providers configured: groq (primary) then mistral as fail-over.
vi.mock('$env/dynamic/private', () => ({
	env: { AI_PROVIDER: 'groq', GROQ_API_KEY: 'test-groq', MISTRAL_API_KEY: 'test-mistral' }
}));

const { runAi } = await import('./provider');

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
		let seen: { abortSignal: AbortSignal; maxRetries: number } | undefined;
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
