// Credit for the home-page photo (ADR 0011). The photo isn't chosen yet: drop
// public/hero/hero.avif, hero.webp and hero.jpg in place and fill this in. The credit line is hidden
// while both fields are empty; the page shows a violet gradient while the files don't exist.
export interface HeroCredit {
	/** e.g. "Jane Doe". */
	photographer: string;
	/** e.g. "WOSM Photo Library". */
	source: string;
	/** Optional link to the source. */
	url?: string;
}

export const HERO_CREDIT: HeroCredit = { photographer: "", source: "" };

/** Alt text for the hero photo; describe the chosen photo here. */
export const HERO_ALT = "";
