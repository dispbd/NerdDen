/**
 * Parse a JSON object out of a model's text reply. Provider/model support for
 * structured output (json_schema) varies, so generators use generateText + this
 * helper instead of generateObject — works on every provider. Strips ``` fences
 * and any prose around the first {...} block. Throws if no valid JSON is found.
 *
 * Pure module (no `$env`), shared with the offline evals.
 */
export function parseJsonFromText(text: string): unknown {
	const cleaned = text
		.trim()
		.replace(/^```(?:json)?/i, '')
		.replace(/```$/, '')
		.trim();
	const start = cleaned.indexOf('{');
	const end = cleaned.lastIndexOf('}');
	const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
	return JSON.parse(slice);
}
