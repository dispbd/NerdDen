/**
 * AI crossword generation — uses the Vercel AI SDK to produce
 * a list of (word, clue) pairs for a given topic and language,
 * then runs them through the grid builder.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { buildCrossword } from '$lib/server/games/crossword/builder';
import type { WordEntry } from '$lib/games/crossword/types';
import type { BuildResult } from '$lib/server/games/crossword/builder';

const WordListSchema = z.object({
	words: z
		.array(
			z.object({
				word: z
					.string()
					.min(3)
					.max(15)
					.regex(/^[A-Za-z]+$/, 'Only letters'),
				clue: z.string().min(5).max(120)
			})
		)
		.min(8)
		.max(20)
});

type WordList = z.infer<typeof WordListSchema>;

const DIFFICULTY_CLUE_STYLE: Record<string, string> = {
	beginner: 'simple, straightforward clues suitable for beginners',
	easy: 'clear clues with minimal wordplay',
	medium: 'standard crossword clues, mix of definitions and gentle wordplay',
	hard: 'cryptic-style clues with wordplay and misdirection',
	expert: 'cryptic clues following standard cryptic crossword conventions',
	extreme: 'highly cryptic, double-meaning clues for expert solvers'
};

/**
 * Ask the AI for a word list suitable for a crossword.
 * Returns words deduplicated and filtered to 3–15 letters.
 */
async function fetchWordList(
	topic: string,
	language: string,
	difficulty: string
): Promise<WordEntry[]> {
	const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
	const clueStyle = DIFFICULTY_CLUE_STYLE[difficulty] ?? DIFFICULTY_CLUE_STYLE.medium;

	const langLabel =
		{ en: 'English', ru: 'Russian (transliterated to Latin)', de: 'German', es: 'Spanish' }[
			language
		] ?? 'English';

	const prompt = `You are a crossword puzzle constructor.
Generate 15 unique words (3–15 letters, only A-Z, no spaces or hyphens) related to the topic "${topic}", in ${langLabel}.
For each word write ${clueStyle}.
Avoid proper nouns unless they are extremely well-known.
Return valid JSON matching this schema: { words: [{word, clue}] }.`;

	const { object } = await generateObject({
		model: openai('gpt-4o-mini'),
		schema: WordListSchema,
		prompt
	});

	// Deduplicate and filter
	const seen = new Set<string>();
	return (object as WordList).words
		.filter((e) => {
			const w = e.word.toUpperCase();
			if (!/^[A-Z]{3,15}$/.test(w) || seen.has(w)) return false;
			seen.add(w);
			return true;
		})
		.map((e) => ({ word: e.word.toUpperCase(), clue: e.clue }));
}

export interface GeneratedCrossword extends BuildResult {
	title: string;
	topic: string;
	language: string;
	difficulty: string;
}

/**
 * Generate a complete crossword: fetch words from AI, build the grid.
 * Falls back to a minimal static set if the API key is missing.
 */
export async function generateCrossword(
	topic: string,
	language = 'en',
	difficulty = 'medium'
): Promise<GeneratedCrossword> {
	let entries: WordEntry[];

	if (env.OPENAI_API_KEY) {
		entries = await fetchWordList(topic, language, difficulty);
	} else {
		// Offline fallback — generic English words so the feature works without an API key
		entries = FALLBACK_ENTRIES;
	}

	const result = buildCrossword(entries);
	const title = `${topic.charAt(0).toUpperCase() + topic.slice(1)} Crossword`;

	return { ...result, title, topic, language, difficulty };
}

// ─── Offline fallback ─────────────────────────────────────────────────────────

const FALLBACK_ENTRIES: WordEntry[] = [
	{ word: 'PLANET', clue: 'A celestial body orbiting a star' },
	{ word: 'STAR', clue: 'A luminous ball of plasma' },
	{ word: 'ORBIT', clue: 'Path taken by a body around another' },
	{ word: 'MOON', clue: 'Natural satellite of Earth' },
	{ word: 'COMET', clue: 'Icy body with a bright tail' },
	{ word: 'GALAXY', clue: 'System of millions of stars' },
	{ word: 'NEBULA', clue: 'Interstellar cloud of gas and dust' },
	{ word: 'CRATER', clue: 'Bowl-shaped depression from impact' },
	{ word: 'ROVER', clue: 'Vehicle sent to explore another planet' },
	{ word: 'TELESCOPE', clue: 'Instrument for observing distant objects' },
	{ word: 'ASTRONAUT', clue: 'Person trained to travel in space' },
	{ word: 'LAUNCH', clue: 'To send a rocket into the air' }
];
