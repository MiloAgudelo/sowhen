// Slugs (ADR 0004).

export const RESERVED_SLUGS: readonly string[] = [
	"api", "new", "admin", "assets", "static", "privacy", "about", "help", "terms",
	"favicon.ico", "robots.txt", "sitemap.xml", "index.html", "_", "health",
	// Static folders: /<slug>/admin would be served as a file (cloudflare.config.ts runWorkerFirst).
	"hero", "flags",
];

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 48;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercase a–z, 0–9, single hyphens, no leading/trailing hyphen, length 3–48. */
export function validateSlug(slug: string): { ok: true } | { ok: false; reason: "format" | "reserved" } {
	if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH || !SLUG.test(slug)) {
		return { ok: false, reason: "format" };
	}
	if (RESERVED_SLUGS.includes(slug)) return { ok: false, reason: "reserved" };
	return { ok: true };
}

/** Letters that don't decompose into base letter + combining mark under NFKD. */
const FOLD: Record<string, string> = {
	"ł": "l", "đ": "d", "ð": "d", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe",
	"þ": "th", "ı": "i", "ħ": "h", "ŧ": "t", "ŀ": "l",
};

/**
 * Suggest a slug from a title ("Comms weekly sync!" → "comms-weekly-sync"). ASCII-folds accents.
 * The result can still fail `validateSlug` (empty, too short, or reserved): callers must check.
 */
export function slugify(title: string): string {
	return title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\x00-\x7f]/gu, (c) => FOLD[c] ?? c)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, SLUG_MAX_LENGTH)
		.replace(/-+$/, "");
}
