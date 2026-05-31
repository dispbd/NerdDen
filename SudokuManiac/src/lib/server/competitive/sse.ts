/**
 * In-memory SSE broadcaster for competitive rooms.
 * One writer per connected client; broadcast pushes to all clients in a room.
 */

type Writer = (chunk: string) => void;

const registry = new Map<string, Set<Writer>>();

export function subscribe(roomId: string, writer: Writer): () => void {
	if (!registry.has(roomId)) registry.set(roomId, new Set());
	registry.get(roomId)!.add(writer);
	return () => {
		registry.get(roomId)?.delete(writer);
		if (registry.get(roomId)?.size === 0) registry.delete(roomId);
	};
}

export function broadcast(roomId: string, event: string, data: unknown) {
	const writers = registry.get(roomId);
	if (!writers) return;
	const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	for (const write of [...writers]) {
		try {
			write(chunk);
		} catch {
			/* client disconnected */
		}
	}
}

export function roomHasListeners(roomId: string): boolean {
	return (registry.get(roomId)?.size ?? 0) > 0;
}
