/**
 * AI trivia question generation.
 * Uses the same provider-agnostic pattern as alias.ts / crossword generator:
 * runAi (auto fail-over) + generateText + parseJsonFromText, with an offline
 * fallback so the feature works without any API key.
 */

import { generateText } from 'ai';
import { runAi, hasAnyAiKey, parseJsonFromText } from './provider';
import type { TriviaQuestion } from '$lib/games/trivia/types';

const DIFFICULTY_PROMPT: Record<string, string> = {
	beginner: 'very easy, common-knowledge questions most people can answer',
	easy: 'easy questions with well-known answers',
	medium: 'moderate questions mixing common knowledge and some detail',
	hard: 'challenging questions requiring specific knowledge',
	expert: 'hard questions for enthusiasts, with subtle distractors',
	extreme: 'very obscure, expert-level questions'
};

const LANG_LABEL: Record<string, string> = {
	en: 'English',
	ru: 'Russian',
	de: 'German',
	es: 'Spanish'
};

/**
 * Generate `count` multiple-choice questions for a topic.
 * Each question has four options, one correct, plus a short explanation.
 * Falls back to a static English bank on missing key / quota / parse errors.
 */
export async function generateTriviaQuestions(
	topic: string,
	language = 'en',
	difficulty = 'medium',
	count = 10
): Promise<TriviaQuestion[]> {
	if (!hasAnyAiKey()) {
		return offlineFallback(count);
	}

	const difficultyDesc = DIFFICULTY_PROMPT[difficulty] ?? DIFFICULTY_PROMPT.medium;
	const langLabel = LANG_LABEL[language] ?? 'English';

	const prompt = `Generate ${count} multiple-choice trivia questions about "${topic}".
Difficulty: ${difficultyDesc}.
Write the question text, all four options, and the explanation entirely in ${langLabel}.
Rules:
- Exactly four options per question, only one correct.
- Make the three wrong options plausible but clearly incorrect.
- Avoid opinion-based or ambiguous questions; each must have one objectively correct answer.
- Keep each explanation to one short sentence stating why the answer is correct.
Return ONLY a JSON object, no markdown, in exactly this shape:
{ "questions": [ { "question": "...", "options": ["...","...","...","..."], "correctIndex": 0, "explanation": "..." } ] }`;

	try {
		const { text } = await runAi((model) => generateText({ model, prompt }));
		const data = parseJsonFromText(text) as { questions?: unknown[] };
		const raw = Array.isArray(data.questions) ? data.questions : [];
		const questions = raw.map(normalize).filter((q): q is TriviaQuestion => q !== null);
		if (!questions.length) return offlineFallback(count);
		return questions.slice(0, count).map(shuffleOptions);
	} catch (e) {
		// Quota / rate-limit / provider / parse errors → offline fallback (no 500).
		console.error('[trivia] AI question generation failed, using offline fallback:', e);
		return offlineFallback(count);
	}
}

/** Validate + coerce one raw AI item into a TriviaQuestion, or null if invalid. */
function normalize(item: unknown): TriviaQuestion | null {
	if (!item || typeof item !== 'object') return null;
	const o = item as Record<string, unknown>;
	const question = String(o.question ?? '').trim();
	const options = Array.isArray(o.options) ? o.options.map((x) => String(x).trim()) : [];
	const correctIndex = Number(o.correctIndex);
	const explanation = String(o.explanation ?? '').trim();

	if (!question) return null;
	if (options.length !== 4 || options.some((x) => !x)) return null;
	if (new Set(options.map((x) => x.toLowerCase())).size !== 4) return null; // distinct
	if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return null;

	return { question, options, correctIndex, explanation };
}

/** Shuffle option order (so the correct answer isn't biased) and re-point correctIndex. */
function shuffleOptions(q: TriviaQuestion): TriviaQuestion {
	const correct = q.options[q.correctIndex];
	const options = [...q.options].sort(() => Math.random() - 0.5);
	return { ...q, options, correctIndex: options.indexOf(correct) };
}

// ─── Offline fallback ─────────────────────────────────────────────────────────

const FALLBACK_QUESTIONS: TriviaQuestion[] = [
	{
		question: 'Which planet is known as the Red Planet?',
		options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
		correctIndex: 1,
		explanation: 'Mars looks red because of iron-oxide (rust) dust on its surface.'
	},
	{
		question: 'What is the largest ocean on Earth?',
		options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
		correctIndex: 3,
		explanation: 'The Pacific Ocean is the largest and deepest of Earth’s oceans.'
	},
	{
		question: 'Who painted the Mona Lisa?',
		options: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'],
		correctIndex: 1,
		explanation: 'Leonardo da Vinci painted the Mona Lisa in the early 16th century.'
	},
	{
		question: 'What is the chemical symbol for gold?',
		options: ['Go', 'Gd', 'Au', 'Ag'],
		correctIndex: 2,
		explanation: 'Gold’s symbol Au comes from the Latin word "aurum".'
	},
	{
		question: 'How many continents are there on Earth?',
		options: ['5', '6', '7', '8'],
		correctIndex: 2,
		explanation: 'There are seven continents by the most common convention.'
	},
	{
		question: 'Which language has the most native speakers?',
		options: ['English', 'Hindi', 'Spanish', 'Mandarin Chinese'],
		correctIndex: 3,
		explanation: 'Mandarin Chinese has the most native speakers worldwide.'
	},
	{
		question: 'What gas do plants primarily absorb for photosynthesis?',
		options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'],
		correctIndex: 2,
		explanation: 'Plants take in carbon dioxide and release oxygen during photosynthesis.'
	},
	{
		question: 'Who wrote the play "Romeo and Juliet"?',
		options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'],
		correctIndex: 1,
		explanation: 'Romeo and Juliet was written by William Shakespeare.'
	},
	{
		question: 'What is the smallest prime number?',
		options: ['0', '1', '2', '3'],
		correctIndex: 2,
		explanation: '2 is the smallest — and the only even — prime number.'
	},
	{
		question: 'In which country would you find the Eiffel Tower?',
		options: ['Italy', 'Spain', 'France', 'Germany'],
		correctIndex: 2,
		explanation: 'The Eiffel Tower stands in Paris, France.'
	},
	{
		question: 'What is the hardest known natural material?',
		options: ['Gold', 'Iron', 'Diamond', 'Quartz'],
		correctIndex: 2,
		explanation: 'Diamond is the hardest naturally occurring material.'
	},
	{
		question: 'Which is the fastest land animal?',
		options: ['Lion', 'Cheetah', 'Horse', 'Greyhound'],
		correctIndex: 1,
		explanation: 'The cheetah can reach around 110 km/h in short bursts.'
	},
	{
		question: 'How many sides does a hexagon have?',
		options: ['5', '6', '7', '8'],
		correctIndex: 1,
		explanation: 'A hexagon has six sides.'
	},
	{
		question: 'What is the capital of Japan?',
		options: ['Seoul', 'Beijing', 'Tokyo', 'Bangkok'],
		correctIndex: 2,
		explanation: 'Tokyo is the capital and largest city of Japan.'
	},
	{
		question: 'Water is made of hydrogen and which other element?',
		options: ['Carbon', 'Oxygen', 'Nitrogen', 'Helium'],
		correctIndex: 1,
		explanation: 'Water (H₂O) is two hydrogen atoms and one oxygen atom.'
	},
	{
		question: 'Which planet is closest to the Sun?',
		options: ['Mercury', 'Venus', 'Earth', 'Mars'],
		correctIndex: 0,
		explanation: 'Mercury is the innermost planet of the Solar System.'
	},
	{
		question: 'Who developed the theory of general relativity?',
		options: ['Isaac Newton', 'Albert Einstein', 'Niels Bohr', 'Galileo Galilei'],
		correctIndex: 1,
		explanation: 'Albert Einstein published general relativity in 1915.'
	},
	{
		question: 'What is the largest mammal on Earth?',
		options: ['African elephant', 'Blue whale', 'Giraffe', 'Hippopotamus'],
		correctIndex: 1,
		explanation: 'The blue whale is the largest animal known to have ever existed.'
	},
	{
		question: 'How many minutes are in a full day?',
		options: ['1200', '1440', '1600', '2400'],
		correctIndex: 1,
		explanation: '24 hours × 60 minutes = 1440 minutes in a day.'
	},
	{
		question: 'Which instrument has 88 keys?',
		options: ['Guitar', 'Violin', 'Piano', 'Flute'],
		correctIndex: 2,
		explanation: 'A standard modern piano has 88 keys.'
	}
];

function offlineFallback(count: number): TriviaQuestion[] {
	const shuffled = [...FALLBACK_QUESTIONS].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, Math.min(count, shuffled.length)).map(shuffleOptions);
}
