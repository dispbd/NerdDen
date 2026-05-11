/**
 * AI-powered word generation for the Alias / Hat game.
 * Uses Vercel AI SDK + OpenAI gpt-4o-mini.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { env } from '$env/dynamic/private';

const WordsSchema = z.object({
	words: z.array(z.string().min(2).max(40)).min(10).max(60)
});

const DIFFICULTY_PROMPT: Record<string, string> = {
	beginner: 'simple, common, everyday words that most people know',
	easy: 'common words, mostly concrete nouns and simple verbs',
	medium: 'a mix of common and moderately specific words, some may be compound',
	hard: 'specific, less common words, including abstract concepts and idioms',
	expert: 'rare, technical, or highly specific words requiring good vocabulary',
	extreme: 'very obscure, archaic, or highly technical terms'
};

const LANG_LABEL: Record<string, string> = {
	en: 'English',
	ru: 'Russian',
	de: 'German',
	es: 'Spanish'
};

/**
 * Generate words for the hat, given a topic, language and difficulty.
 * Returns deduplicated list of strings.
 */
export async function generateAliasWords(
	topic: string,
	language = 'en',
	difficulty = 'medium',
	count = 30
): Promise<string[]> {
	if (!env.OPENAI_API_KEY) {
		return getOfflineFallback(count);
	}

	const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
	const difficultyDesc = DIFFICULTY_PROMPT[difficulty] ?? DIFFICULTY_PROMPT.medium;
	const langLabel = LANG_LABEL[language] ?? 'English';

	const prompt = `Generate ${Math.min(count + 10, 60)} unique words or short phrases (max 4 words) related to the topic "${topic}", in ${langLabel}.
Use ${difficultyDesc}.
These words will be used in a party game where one player describes the word without saying it.
Words should be fun, varied, and guessable.
Do NOT include: proper names of specific people, very offensive content, or words that are impossible to describe.
Return JSON: { words: ["word1", "word2", ...] }`;

	const { object } = await generateObject({
		model: openai('gpt-4o-mini'),
		schema: WordsSchema,
		prompt
	});

	// Deduplicate and trim
	const seen = new Set<string>();
	return object.words
		.map((w: string) => w.trim())
		.filter((w: string) => {
			if (!w || seen.has(w.toLowerCase())) return false;
			seen.add(w.toLowerCase());
			return true;
		})
		.slice(0, count);
}

// ─── Offline fallback ─────────────────────────────────────────────────────────

const FALLBACK_WORDS = [
	'Rainbow', 'Thunderstorm', 'Library', 'Submarine', 'Telescope',
	'Volcano', 'Orchestra', 'Parachute', 'Lighthouse', 'Compass',
	'Elevator', 'Waterfall', 'Kangaroo', 'Microscope', 'Avalanche',
	'Binoculars', 'Caterpillar', 'Democracy', 'Expedition', 'Fossil',
	'Glacier', 'Hammock', 'Illusion', 'Jellyfish', 'Kaleidoscope',
	'Labyrinth', 'Magnet', 'Navigation', 'Observatory', 'Pendulum',
	'Quicksand', 'Reservoir', 'Satellite', 'Trapeze', 'Ultrasound'
];

function getOfflineFallback(count: number): string[] {
	const shuffled = [...FALLBACK_WORDS].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, Math.min(count, shuffled.length));
}
