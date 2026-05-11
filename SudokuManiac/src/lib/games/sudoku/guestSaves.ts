/**
 * Browser-only localStorage helpers for guest (unauthenticated) save slots.
 * Stores up to MAX_SAVES recent in-progress sessions; older ones are evicted.
 */

import type { Difficulty, Grid, GridSize } from './shared';

const STORAGE_KEY = 'sudoku_guest_saves';
const MAX_SAVES = 3;

export interface GuestSave {
	id: string;
	difficulty: Difficulty;
	gridSize: GridSize;
	gridState: Grid;
	solution: Grid;
	timeSpent: number;
	createdAt: string; // ISO 8601
	updatedAt: string; // ISO 8601
}

export function loadGuestSaves(): GuestSave[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function persist(saves: GuestSave[]): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
}

/** Insert or update a save, keeping the most recent MAX_SAVES entries. */
export function saveGuestSession(save: GuestSave): void {
	let saves = loadGuestSaves();
	const idx = saves.findIndex((s) => s.id === save.id);
	if (idx >= 0) {
		saves[idx] = save;
	} else {
		saves.unshift(save);
		saves.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
		saves = saves.slice(0, MAX_SAVES);
	}
	persist(saves);
}

/** Patch grid state and time on an existing save. */
export function updateGuestSave(id: string, updates: { gridState?: Grid; timeSpent?: number }): void {
	const saves = loadGuestSaves();
	const idx = saves.findIndex((s) => s.id === id);
	if (idx < 0) return;
	saves[idx] = { ...saves[idx], ...updates, updatedAt: new Date().toISOString() };
	persist(saves);
}

/** Remove a save by id. */
export function deleteGuestSave(id: string): void {
	persist(loadGuestSaves().filter((s) => s.id !== id));
}

/** Create a fresh save slot and persist it; returns the new save. */
export function createGuestSave(params: {
	difficulty: Difficulty;
	gridSize: GridSize;
	gridState: Grid;
	solution: Grid;
}): GuestSave {
	const now = new Date().toISOString();
	const save: GuestSave = {
		id: crypto.randomUUID(),
		...params,
		timeSpent: 0,
		createdAt: now,
		updatedAt: now
	};
	saveGuestSession(save);
	return save;
}
