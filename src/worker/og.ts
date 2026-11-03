// Link-preview tags for page HTML (ADR 0015). Pure: no `cloudflare:workers`, no HTMLRewriter, so it
// runs in Vitest. The Worker wiring (assets fetch, D1 read, HTMLRewriter) lives in ./pages.ts.
//
// index.html carries the site-wide tags (og:site_name, og:type, twitter:card, favicon) plus home-page
// defaults for the per-page ones, marked `data-page`. The Worker drops the `data-page` elements and
// appends the set built here: <title>, description, og:title, og:description, og:url, og:image with its
// type/width/height/alt right after it (ADR 0018: an event's own image or the static one),
// twitter:title/description, canonical link and, on event and admin pages, robots noindex.
import { formatDates, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/shared/preview";

export { formatDates };

/** The canonical public origin. Local hosts keep their own origin so dev and e2e stay self-contained. */
export const CANONICAL_ORIGIN = "https://sowhen.uk";

const DEFAULT_TITLE = "sowhen: find a time across time zones";
const DEFAULT_DESCRIPTION = "Paint when you're free. Everyone sees the grid in their own time zone.";
const EVENT_TAIL = "Paint when you're free; everyone sees their own time zone.";
const DEFAULT_IMAGE_ALT =
	"sowhen: find a time across time zones. Scouts facing a row of flags and the Alps under a red tint.";

const SLUG = /^[a-z0-9-]{1,64}$/;

export type PageRoute =
	| { name: "home" }
	| { name: "privacy" }
	| { name: "event"; slug: string }
	| { name: "admin"; slug: string };

/**
 * The page routes the Worker renders, mirroring src/lib/route.ts. Anything else (static files, Vite's
 * dev module URLs, malformed paths) returns null and goes to the asset server untouched.
 */
export function matchPageRoute(pathname: string): PageRoute | null {
	const path = pathname.replace(/\/+$/, "") || "/";
	if (path === "/") return { name: "home" };
	if (path === "/privacy") return { name: "privacy" };
	const parts = path.split("/").slice(1);
	if (parts.length > 2 || (parts.length === 2 && parts[1] !== "admin")) return null;
	let slug: string;
	try {
		slug = decodeURIComponent(parts[0] ?? "").toLowerCase();
	} catch {
		return null;
	}
	if (!SLUG.test(slug)) return null;
	return parts.length === 1 ? { name: "event", slug } : { name: "admin", slug };
}

/** What a preview may say about a live event. Deliberately has no names (ADR 0015, ADR 0008). */
export interface EventPreview {
	title: string;
	creatorZone: string;
	/** ISO calendar dates in the creator zone. */
	dates: string[];
	responseCount: number;
	/**
	 * Cache key of the event's own preview image (ADR 0018), when one is stored and still shows the
	 * current title and dates. Absent: the static image.
	 */
	imageKey?: string;
}

export interface PageHead {
	title: string;
	description: string;
	/**
	 * The per-page tags, escaped, ready to append to <head>. They replace index.html's own copies,
	 * which are marked `data-page`.
	 */
	html: string;
}

export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/** Origin used in og:url / og:image: the request's own origin on local hosts, sowhen.uk otherwise. */
export function canonicalOrigin(requestUrl: URL): string {
	const host = requestUrl.hostname;
	const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
	return local ? requestUrl.origin : CANONICAL_ORIGIN;
}

function canonicalPath(route: PageRoute): string {
	switch (route.name) {
		case "home":
			return "/";
		case "privacy":
			return "/privacy";
		case "event":
			return `/${route.slug}`;
		case "admin":
			return `/${route.slug}/admin`;
	}
}

/**
 * Builds the per-page head. `event` is the live event for an event route, or null when it's unknown
 * or expired (both look the same, ADR 0008). Admin pages always get generic tags.
 */
export function buildPageHead(route: PageRoute, event: EventPreview | null, origin: string): PageHead {
	let title = DEFAULT_TITLE;
	let ogTitle = DEFAULT_TITLE;
	let description = DEFAULT_DESCRIPTION;
	if (route.name === "privacy") {
		title = ogTitle = "Privacy · sowhen";
	} else if (route.name === "event" && event) {
		title = `${event.title} · sowhen`;
		ogTitle = event.title;
		description = describeEvent(event);
	}
	const url = origin + canonicalPath(route);
	const image =
		route.name === "event" && event?.imageKey
			? {
					url: `${origin}/api/events/${encodeURIComponent(route.slug)}/og-image?k=${encodeURIComponent(event.imageKey)}`,
					type: "image/jpeg",
					alt: `${event.title}: ${formatDates(event.dates)}. Event on sowhen.`,
				}
			: { url: `${origin}/og/sowhen.png`, type: "image/png", alt: DEFAULT_IMAGE_ALT };
	const noindex = route.name === "event" || route.name === "admin";

	const meta = (attr: "property" | "name", key: string, content: string) =>
		`<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
	const html = [
		`<title>${escapeHtml(title)}</title>`,
		meta("name", "description", description),
		meta("property", "og:title", ogTitle),
		meta("property", "og:description", description),
		meta("property", "og:url", url),
		meta("property", "og:image", image.url),
		meta("property", "og:image:type", image.type),
		meta("property", "og:image:width", String(OG_IMAGE_WIDTH)),
		meta("property", "og:image:height", String(OG_IMAGE_HEIGHT)),
		meta("property", "og:image:alt", image.alt),
		meta("name", "twitter:title", ogTitle),
		meta("name", "twitter:description", description),
		`<link rel="canonical" href="${escapeHtml(url)}" />`,
		...(noindex ? [meta("name", "robots", "noindex")] : []),
	].join("\n");
	return { title, description, html };
}

/** "Tue 10 – Fri 14 Nov (Warsaw time) · 4 people have answered · Paint when you're free; …" */
export function describeEvent(event: EventPreview): string {
	return [`${formatDates(event.dates)} (${zoneCity(event.creatorZone)} time)`, answered(event.responseCount), EVENT_TAIL]
		.filter(Boolean)
		.join(" · ");
}

function answered(n: number): string {
	if (n <= 0) return "No one has answered yet";
	return n === 1 ? "1 person has answered" : `${n} people have answered`;
}

/** "Europe/Warsaw" → "Warsaw", "America/Argentina/Buenos_Aires" → "Buenos Aires", "UTC" → "UTC". */
export function zoneCity(zone: string): string {
	return (zone.split("/").pop() ?? zone).replaceAll("_", " ");
}
