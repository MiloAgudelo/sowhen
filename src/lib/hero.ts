// Credit for the home-page photo (ADR 0011). Files: public/hero/hero.{avif,webp,jpg}.
// Source: WOSM Photo Library (brand.scout.org/document/82), asset
// LM_KISCSummer_InternationalEvening_20260719-15. Its legal notice allows non-commercial use with credit;
// the credit below is the asset's own copyright notice.
export interface HeroCredit {
	/** e.g. "Jane Doe". */
	photographer: string;
	/** e.g. "WOSM Photo Library". */
	source: string;
	/** Optional link to the source. */
	url?: string;
	/** When set, shown verbatim instead of "Photo: <photographer> · <source>". */
	line?: string;
}

export const HERO_CREDIT: HeroCredit = {
	photographer: "Leonor Moura",
	source: "Kandersteg International Scout Centre",
	line: "© Kandersteg International Scout Centre / Leonor Moura",
};

/** Alt text for the hero photo. */
export const HERO_ALT =
	"Scouts seen from behind with their arms around each other's shoulders, facing a row of national flags and the Swiss Alps at dusk.";
