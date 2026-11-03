// Page HTML with link-preview tags (ADR 0015). The Worker runs first for page routes
// (cloudflare.config.ts runWorkerFirst); this reads index.html from the assets binding and swaps in
// the per-page tags built by ./og.ts.
import { buildPageHead, canonicalOrigin, matchPageRoute, type EventPreview } from "./og";
import { imageKey } from "./og-image";

/** HTML may be cached briefly, so crawler bursts don't each hit D1 (ADR 0015). /api stays no-store. */
const HTML_CACHE = "public, max-age=60";

/**
 * Serves `request` if it's a page route, otherwise passes it to the asset server untouched (static
 * files that slip past the negative rules, Vite's dev module URLs, malformed paths → SPA fallback).
 */
export async function servePage(request: Request, assets: Fetcher, db: D1Database, now = new Date()): Promise<Response> {
	const url = new URL(request.url);
	const route = request.method === "GET" || request.method === "HEAD" ? matchPageRoute(url.pathname) : null;
	if (!route) return assets.fetch(request);

	// A fresh request for "/" (not /index.html, which redirects; not the original, whose conditional
	// headers could return a bodiless 304).
	const shell = await assets.fetch(new Request(new URL("/", url)));
	if (shell.status !== 200 || !(shell.headers.get("Content-Type") ?? "").includes("text/html")) return shell;

	const event = route.name === "event" ? await readPreview(db, route.slug, now) : null;
	const head = buildPageHead(route, event, canonicalOrigin(url));

	const rewritten = new HTMLRewriter()
		.on("[data-page]", { element: (el) => void el.remove() })
		.on("head", { element: (el) => void el.append(head.html, { html: true }) })
		.transform(shell);
	const headers = new Headers(rewritten.headers);
	headers.delete("ETag");
	headers.delete("Content-Length");
	headers.set("Cache-Control", HTML_CACHE);
	return new Response(request.method === "HEAD" ? null : rewritten.body, { status: 200, headers });
}

/** One cheap read: the live event's preview fields, response count and fresh image key. Never names. */
export async function readPreview(db: D1Database, slug: string, now: Date): Promise<EventPreview | null> {
	try {
		const row = await db
			.prepare(
				"SELECT title, creator_zone, dates, (SELECT COUNT(*) FROM responses WHERE event_slug = events.slug) AS responses, " +
					"(SELECT updated_at FROM og_images o WHERE o.event_slug = events.slug AND o.drawn_title = events.title " +
					"AND o.drawn_dates = events.dates) AS image_at " +
					"FROM events WHERE slug = ? AND expires_at > ?",
			)
			.bind(slug, now.toISOString())
			.first<{ title: string; creator_zone: string; dates: string; responses: number; image_at: string | null }>();
		if (!row) return null;
		return {
			title: row.title,
			creatorZone: row.creator_zone,
			dates: JSON.parse(row.dates),
			responseCount: row.responses,
			...(row.image_at ? { imageKey: imageKey(row.image_at) } : {}),
		};
	} catch (err) {
		// A D1 hiccup must not break the page: fall back to the generic tags.
		console.error("sowhen preview read failed", err);
		return null;
	}
}
