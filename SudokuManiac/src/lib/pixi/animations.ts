/**
 * PixiJS animations for the Sudoku board.
 * Uses the PixiJS Ticker for frame-based animations.
 */

import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import type { Application } from 'pixi.js';

// ─── Flash animation ──────────────────────────────────────────────────────────

/**
 * Flash a cell background with a given color, then fade back.
 * @param app PixiJS Application
 * @param x cell left px
 * @param y cell top px
 * @param w cell width px
 * @param color flash color (e.g. 0xff4444 for error)
 * @param durationMs total duration in ms
 */
export function flashCell(
	app: Application,
	x: number,
	y: number,
	w: number,
	color: number,
	durationMs = 400
): void {
	const overlay = new Graphics();
	overlay.rect(x + 1, y + 1, w - 2, w - 2).fill({ color, alpha: 0.7 });
	app.stage.addChild(overlay);

	const start = performance.now();

	const tick = () => {
		const elapsed = performance.now() - start;
		const progress = Math.min(elapsed / durationMs, 1);
		overlay.alpha = 0.7 * (1 - progress);
		if (progress >= 1) {
			app.ticker.remove(tick);
			app.stage.removeChild(overlay);
			overlay.destroy();
		}
	};

	app.ticker.add(tick);
}

// ─── Pulse animation (cell selected) ─────────────────────────────────────────

/**
 * A subtle scale-pulse on a container (e.g. digit text).
 */
export function pulseScale(
	app: Application,
	target: { scale: { set: (x: number, y: number) => void } },
	peakScale = 1.15,
	durationMs = 200
): void {
	const start = performance.now();

	const tick = () => {
		const elapsed = performance.now() - start;
		const progress = Math.min(elapsed / durationMs, 1);
		// easeOut sine
		const t = Math.sin(progress * Math.PI);
		const s = 1 + (peakScale - 1) * t;
		target.scale.set(s, s);
		if (progress >= 1) {
			target.scale.set(1, 1);
			app.ticker.remove(tick);
		}
	};

	app.ticker.add(tick);
}

// ─── Victory animation ────────────────────────────────────────────────────────

/**
 * Full-board victory overlay: cascading cell highlights + centered message.
 * Calls onComplete after the animation finishes.
 */
export function playVictoryAnimation(
	app: Application,
	boardContainer: Container,
	cellSize: number,
	onComplete?: () => void
): void {
	const overlay = new Container();
	app.stage.addChild(overlay);

	const cells: Graphics[] = [];
	for (let r = 0; r < 9; r++) {
		for (let c = 0; c < 9; c++) {
			const cell = new Graphics();
			cell.rect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, cellSize - 2).fill({
				color: 0x22c55e,
				alpha: 0
			});
			overlay.addChild(cell);
			cells.push(cell);
		}
	}

	// Offset overlay to match boardContainer position
	overlay.position.copyFrom(boardContainer.position);

	const totalMs = 1200;
	const start = performance.now();

	const tick = () => {
		const elapsed = performance.now() - start;
		const progress = Math.min(elapsed / totalMs, 1);

		cells.forEach((cell, i) => {
			const delay = (i / 81) * 0.6;
			const t = Math.max(0, Math.min((progress - delay) / 0.4, 1));
			// triangle wave: peak at t=0.5
			cell.alpha = t < 0.5 ? t * 2 * 0.55 : (1 - t) * 2 * 0.55;
		});

		if (progress >= 1) {
			app.ticker.remove(tick);
			app.stage.removeChild(overlay);
			overlay.destroy(true);
			showVictoryBanner(app, onComplete);
		}
	};

	app.ticker.add(tick);
}

function showVictoryBanner(app: Application, onComplete?: () => void): void {
	const banner = new Container();

	const bg = new Graphics();
	const bw = 280;
	const bh = 80;
	const bx = (app.screen.width - bw) / 2;
	const by = (app.screen.height - bh) / 2;
	bg.roundRect(bx, by, bw, bh, 16).fill({ color: 0x14532d, alpha: 0.9 });
	banner.addChild(bg);

	const text = new Text({
		text: '🎉 Puzzle Solved!',
		style: new TextStyle({
			fontFamily: 'system-ui, sans-serif',
			fontSize: 26,
			fontWeight: '700',
			fill: 0xffffff
		})
	});
	text.anchor.set(0.5);
	text.position.set(app.screen.width / 2, app.screen.height / 2);
	banner.addChild(text);

	banner.alpha = 0;
	app.stage.addChild(banner);

	const start = performance.now();
	const fadeMs = 300;
	const holdMs = 1500;
	const total = fadeMs * 2 + holdMs;

	const tick = () => {
		const elapsed = performance.now() - start;
		const progress = elapsed / total;

		if (elapsed < fadeMs) {
			banner.alpha = elapsed / fadeMs;
		} else if (elapsed < fadeMs + holdMs) {
			banner.alpha = 1;
		} else {
			banner.alpha = 1 - (elapsed - fadeMs - holdMs) / fadeMs;
		}

		if (progress >= 1) {
			app.ticker.remove(tick);
			app.stage.removeChild(banner);
			banner.destroy(true);
			onComplete?.();
		}
	};

	app.ticker.add(tick);
}
