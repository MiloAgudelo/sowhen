// Names (ADR 0005).

export const MAX_DISPLAY_NAME = 40;

const collapse = (s: string) => s.trim().replace(/\s+/gu, " ");

/** Trim, collapse inner whitespace, Unicode NFC, case-fold (toLocaleLowerCase("und")). */
export function normaliseName(name: string): string {
	// NFC again after lowercasing: case mapping can leave a string that is not NFC.
	return collapse(name).normalize("NFC").toLocaleLowerCase("und").normalize("NFC");
}

/**
 * Display-name cleanup: trim + collapse whitespace (and NFC); max 40 chars. Returns null if empty.
 * Longer names are truncated to 40 grapheme clusters, so an accent or emoji is never split.
 */
export function cleanDisplayName(name: string): string | null {
	const s = collapse(name).normalize("NFC");
	if (!s) return null;
	const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)];
	if (graphemes.length <= MAX_DISPLAY_NAME) return s;
	return graphemes
		.slice(0, MAX_DISPLAY_NAME)
		.map((g) => g.segment)
		.join("")
		.trimEnd();
}
