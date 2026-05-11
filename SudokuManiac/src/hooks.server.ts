import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { handleWebsocket as competitiveWs } from '$lib/server/competitive/websocket';
import { handleAliasWebsocket as aliasWs } from '$lib/server/alias/websocket';
import type { ServerWebSocket } from 'bun';

// ─── Unified WebSocket router ─────────────────────────────────────────────────

type WsEnvelope =
	| { wsType: 'competitive'; data: Parameters<typeof competitiveWs.upgrade>[0] extends Request ? Awaited<ReturnType<typeof competitiveWs.upgrade>> extends Response ? never : Awaited<ReturnType<typeof competitiveWs.upgrade>> : never }
	| { wsType: 'alias'; data: unknown };

// We use a simpler discriminated union via the wsType tag stored in the data itself.
// Both inner handlers receive a ws whose `.data` contains their own fields.
// We piggyback a `wsType` marker at the top level.

export const handleWebsocket = {
	async upgrade(request: Request): Promise<Record<string, unknown> | Response> {
		const url = new URL(request.url);
		const isAlias = url.pathname.startsWith('/ws/alias');

		if (isAlias) {
			const result = await aliasWs.upgrade(request);
			if (result instanceof Response) return result;
			return { wsType: 'alias', ...result };
		}

		// competitive
		const result = await competitiveWs.upgrade(request);
		if (result instanceof Response) return result;
		return { wsType: 'competitive', ...result };
	},

	open(ws: ServerWebSocket<Record<string, unknown>>) {
		if (ws.data.wsType === 'alias') {
			aliasWs.open?.(ws as never);
		} else {
			competitiveWs.open?.(ws as never);
		}
	},

	async message(ws: ServerWebSocket<Record<string, unknown>>, raw: string | Buffer) {
		if (ws.data.wsType === 'alias') {
			await aliasWs.message(ws as never, raw);
		} else {
			await competitiveWs.message(ws as never, raw);
		}
	},

	close(ws: ServerWebSocket<Record<string, unknown>>, code: number, reason: string) {
		if (ws.data.wsType === 'alias') {
			aliasWs.close(ws as never);
		} else {
			competitiveWs.close(ws as never);
		}
	}
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(handleParaglide, handleBetterAuth);
