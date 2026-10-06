import { beforeEach, describe, expect, it, vi } from 'vitest';

const spendHint = vi.fn();
const refundHints = vi.fn();
const getAiHint = vi.fn();
vi.mock('$lib/server/games/sudoku/sessions', () => ({ spendHint, refundHints }));
vi.mock('$lib/server/ai/hints', () => ({ getAiHint }));

const { POST } = await import('./+server');

const call = (user: { id: string } | null = { id: 'u1' }) =>
	POST({
		request: new Request('http://x/api/ai/hint', {
			method: 'POST',
			body: JSON.stringify({ puzzle: [[0]], playerGrid: [[0]] })
		}),
		locals: { user }
	} as never);

/** spendHint returns the hints left after spending one, or null when none were left. */
function wallet(start: number) {
	let left = start;
	spendHint.mockImplementation(async () => (left > 0 ? --left : null));
}

describe('POST /api/ai/hint', () => {
	beforeEach(() => vi.clearAllMocks());

	it('charges 3 hints and returns the hint on success', async () => {
		wallet(5);
		getAiHint.mockResolvedValue('Look at column 5.');
		const res = await call();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ hint: 'Look at column 5.' });
		expect(spendHint).toHaveBeenCalledTimes(3);
		expect(refundHints).not.toHaveBeenCalled();
	});

	it('refunds all 3 hints when the AI tutor fails, instead of a bare 500', async () => {
		wallet(5);
		getAiHint.mockRejectedValue(new Error('every provider failed'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await call();
		expect(res.status).toBe(503);
		expect(refundHints).toHaveBeenCalledWith('u1', 3);
	});

	it('refunds what it already took when the player runs short mid-way', async () => {
		wallet(2);
		const res = await call();
		expect(res.status).toBe(400);
		expect(getAiHint).not.toHaveBeenCalled();
		// Two hints: the first spend leaves 1, short of the 2 still needed → give back 1.
		expect(spendHint).toHaveBeenCalledTimes(1);
		expect(refundHints).toHaveBeenCalledWith('u1', 1);
	});

	it('takes nothing when the player has no hints', async () => {
		wallet(0);
		const res = await call();
		expect(res.status).toBe(400);
		expect(refundHints.mock.calls.every(([, c]) => c === 0)).toBe(true);
	});

	it('rejects anonymous callers', async () => {
		expect((await call(null)).status).toBe(401);
		expect(spendHint).not.toHaveBeenCalled();
	});
});
