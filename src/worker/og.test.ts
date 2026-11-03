// Link-preview tags (ADR 0015): the pure tag builder, the one-query preview read and the routing
// decision. HTMLRewriter only exists in workerd, so the rewrite itself is covered by e2e/og.spec.ts.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
	buildPageHead,
	canonicalOrigin,
	describeEvent,
	escapeHtml,
	formatDates,
	matchPageRoute,
	zoneCity,
	type EventPreview,
} from "./og";
import { readPreview, servePage } from "./pages";

const ORIGIN = "https://sowhen.uk";

const EVENT: EventPreview = {
	title: "Comms weekly",
	creatorZone: "Europe/Warsaw",
	dates: ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"],
	responseCount: 4,
};

/** content="…" of the tag with this property/name, unescaped back to text. */
function tag(html: string, key: string): string | undefined {
	const m = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)" />`));
	return m?.[1]?.replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

describe("matchPageRoute", () => {
	it("matches the four page shapes", () => {
		expect(matchPageRoute("/")).toEqual({ name: "home" });
		expect(matchPageRoute("/privacy")).toEqual({ name: "privacy" });
		expect(matchPageRoute("/privacy/")).toEqual({ name: "privacy" });
		expect(matchPageRoute("/comms-weekly")).toEqual({ name: "event", slug: "comms-weekly" });
		expect(matchPageRoute("/Comms-Weekly/")).toEqual({ name: "event", slug: "comms-weekly" });
		expect(matchPageRoute("/comms-weekly/admin")).toEqual({ name: "admin", slug: "comms-weekly" });
	});

	it("leaves files, dev module URLs and malformed paths to the asset server", () => {
		for (const p of ["/hero/hero.jpg", "/assets/index-abc.js", "/favicon.svg", "/src/main.tsx", "/@vite/client", "/Not_A_Slug!", "/a/b/c", "/a/edit", "/%E0%A4%A", "/__grid"]) {
			expect(matchPageRoute(p), p).toBeNull();
		}
	});
});

describe("buildPageHead", () => {
	it("home: generic tags, canonical on sowhen.uk, indexable", () => {
		const { html, title } = buildPageHead({ name: "home" }, null, ORIGIN);
		expect(title).toBe("sowhen: find a time across time zones");
		expect(tag(html, "og:title")).toBe("sowhen: find a time across time zones");
		expect(tag(html, "og:url")).toBe("https://sowhen.uk/");
		expect(tag(html, "og:image")).toBe("https://sowhen.uk/og/sowhen.png");
		expect(html).toContain('<link rel="canonical" href="https://sowhen.uk/" />');
		expect(tag(html, "robots")).toBeUndefined();
	});

	it("event: title and dates/count description, noindex", () => {
		const { html, title } = buildPageHead({ name: "event", slug: "comms-weekly" }, EVENT, ORIGIN);
		expect(title).toBe("Comms weekly · sowhen");
		expect(tag(html, "og:title")).toBe("Comms weekly");
		expect(tag(html, "twitter:title")).toBe("Comms weekly");
		expect(tag(html, "og:description")).toBe(
			"Tue 10 – Sat 14 Nov (Warsaw time) · 4 people have answered · Paint when you're free; everyone sees their own time zone.",
		);
		expect(tag(html, "description")).toBe(tag(html, "og:description"));
		expect(tag(html, "og:url")).toBe("https://sowhen.uk/comms-weekly");
		expect(tag(html, "robots")).toBe("noindex");
	});

	it("event with its own image (ADR 0018): a keyed JPEG URL, with type, size and alt", () => {
		const { html } = buildPageHead({ name: "event", slug: "comms-weekly" }, { ...EVENT, imageKey: "abc" }, ORIGIN);
		expect(tag(html, "og:image")).toBe("https://sowhen.uk/api/events/comms-weekly/og-image?k=abc");
		expect(tag(html, "og:image:type")).toBe("image/jpeg");
		expect(tag(html, "og:image:width")).toBe("1200");
		expect(tag(html, "og:image:height")).toBe("630");
		expect(tag(html, "og:image:alt")).toBe("Comms weekly: Tue 10 – Sat 14 Nov. Event on sowhen.");
		// Without one, and on other pages, the static PNG.
		const plain = buildPageHead({ name: "event", slug: "comms-weekly" }, EVENT, ORIGIN).html;
		expect(tag(plain, "og:image")).toBe("https://sowhen.uk/og/sowhen.png");
		expect(tag(plain, "og:image:type")).toBe("image/png");
	});

	it("unknown or expired event: the same generic tags as home, still noindex", () => {
		const home = buildPageHead({ name: "home" }, null, ORIGIN);
		const gone = buildPageHead({ name: "event", slug: "gone" }, null, ORIGIN);
		expect(tag(gone.html, "og:title")).toBe(tag(home.html, "og:title"));
		expect(tag(gone.html, "og:description")).toBe(tag(home.html, "og:description"));
		expect(gone.title).toBe(home.title);
		expect(tag(gone.html, "robots")).toBe("noindex");
	});

	it("admin: generic tags even when the event exists, noindex", () => {
		const { html } = buildPageHead({ name: "admin", slug: "comms-weekly" }, EVENT, ORIGIN);
		expect(html).not.toContain("Comms weekly");
		expect(html).not.toContain("answered");
		expect(tag(html, "og:url")).toBe("https://sowhen.uk/comms-weekly/admin");
		expect(tag(html, "robots")).toBe("noindex");
	});

	it("privacy: its own title, indexable", () => {
		const { html, title } = buildPageHead({ name: "privacy" }, null, ORIGIN);
		expect(title).toBe("Privacy · sowhen");
		expect(tag(html, "og:url")).toBe("https://sowhen.uk/privacy");
		expect(tag(html, "robots")).toBeUndefined();
	});

	it("escapes the title everywhere it appears", () => {
		const evil = { ...EVENT, title: `"><script>alert('x')</script> & co` };
		const { html } = buildPageHead({ name: "event", slug: "x" }, evil, ORIGIN);
		expect(html).not.toContain("<script>");
		expect(html).not.toContain(`"><`);
		expect(html).toContain("<title>&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; co · sowhen</title>");
		expect(tag(html, "og:title")).toBe(evil.title);
		// Every tag is well formed: nothing broke out of its attribute.
		for (const line of html.split("\n")) expect(line).toMatch(/^<(title>[^<]*<\/title|meta [^<>]*\/|link [^<>]*\/)>$/);
	});

	it("never puts response names in a preview: the input type has none, and nothing else leaks", () => {
		const withNames = { ...EVENT, names: ["Zofia"], responses: [{ name: "Zofia" }] } as unknown as EventPreview;
		const { html } = buildPageHead({ name: "event", slug: "x" }, withNames, ORIGIN);
		expect(html).not.toContain("Zofia");
	});
});

describe("describeEvent / formatDates", () => {
	it("counts people", () => {
		expect(describeEvent({ ...EVENT, responseCount: 0 })).toContain("No one has answered yet");
		expect(describeEvent({ ...EVENT, responseCount: 1 })).toContain("1 person has answered");
		expect(describeEvent({ ...EVENT, responseCount: 12 })).toContain("12 people have answered");
	});

	it("formats calendar dates without shifting them", () => {
		expect(formatDates(["2026-11-10"])).toBe("Tue 10 Nov");
		expect(formatDates(["2026-11-12", "2026-11-10", "2026-11-11"])).toBe("Tue 10 – Thu 12 Nov");
		expect(formatDates(["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"])).toBe("Sat 28 Nov – Wed 2 Dec");
		expect(formatDates(["2026-11-10", "2026-11-12", "2026-11-14"])).toBe("3 dates, Tue 10 – Sat 14 Nov");
		expect(formatDates(["2026-12-31", "2027-01-01"])).toBe("Thu 31 Dec 2026 – Fri 1 Jan 2027");
		expect(formatDates([])).toBe("");
	});

	it("names the creator zone by its city", () => {
		expect(zoneCity("Europe/Warsaw")).toBe("Warsaw");
		expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
		expect(zoneCity("UTC")).toBe("UTC");
		expect(describeEvent({ ...EVENT, creatorZone: "America/Mexico_City" })).toContain("(Mexico City time)");
	});
});

describe("canonicalOrigin / escapeHtml", () => {
	it("uses sowhen.uk except on local hosts", () => {
		expect(canonicalOrigin(new URL("https://sowhen.uk/x"))).toBe("https://sowhen.uk");
		expect(canonicalOrigin(new URL("https://sowhen.example.workers.dev/x"))).toBe("https://sowhen.uk");
		expect(canonicalOrigin(new URL("http://127.0.0.1:5199/x"))).toBe("http://127.0.0.1:5199");
		expect(canonicalOrigin(new URL("http://localhost:5173/"))).toBe("http://localhost:5173");
	});

	it("escapes the five HTML specials", () => {
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
	});
});

// ---- readPreview: one query against the real schema (node:sqlite stand-in for D1)

function fakeD1(): { raw: DatabaseSync; d1: D1Database; queries: string[] } {
	const raw = new DatabaseSync(":memory:");
	const dir = fileURLToPath(new URL("../../migrations/", import.meta.url));
	for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) raw.exec(readFileSync(dir + f, "utf8"));
	const queries: string[] = [];
	const d1 = {
		prepare(sql: string) {
			queries.push(sql);
			let params: SQLInputValue[] = [];
			const stmt = {
				bind: (...p: SQLInputValue[]) => ((params = p), stmt),
				first: async () => {
					const row = raw.prepare(sql).get(...params);
					return row ? { ...row } : null;
				},
			};
			return stmt;
		},
	};
	return { raw, d1: d1 as unknown as D1Database, queries };
}

function insertEvent(raw: DatabaseSync, slug: string, expiresAt: string, names: string[]) {
	raw.prepare(
		`INSERT INTO events (slug, title, creator_zone, dates, window_start, window_end, columns, admin_hash, created_at, expires_at)
		 VALUES (?, 'Comms weekly', 'Europe/Warsaw', '["2027-02-10","2027-02-09"]', '09:00', '18:00', '[]', 'h', '2027-01-01T00:00:00Z', ?)`,
	).run(slug, expiresAt);
	for (const n of names) {
		raw.prepare("INSERT INTO responses (event_slug, name_key, name, updated_at) VALUES (?, ?, ?, '2027-01-01T00:00:00Z')").run(slug, n.toLowerCase(), n);
	}
}

describe("readPreview", () => {
	const NOW = new Date("2027-01-15T00:00:00Z");

	it("reads title, zone, dates and the response count in one query, and no names", async () => {
		const { raw, d1, queries } = fakeD1();
		insertEvent(raw, "comms", "2027-03-15T00:00:00Z", ["Zofia", "Kasia", "Ana"]);
		const p = await readPreview(d1, "comms", NOW);
		expect(p).toEqual({ title: "Comms weekly", creatorZone: "Europe/Warsaw", dates: ["2027-02-10", "2027-02-09"], responseCount: 3 });
		expect(queries).toHaveLength(1);
		expect(JSON.stringify(p)).not.toMatch(/Zofia|Kasia|Ana/);
	});

	it("returns the image key only while the stored image shows the current title and dates", async () => {
		const { raw, d1 } = fakeD1();
		insertEvent(raw, "comms", "2027-03-15T00:00:00Z", []);
		raw.prepare(
			`INSERT INTO og_images (event_slug, image, drawn_title, drawn_dates, updated_at)
			 VALUES ('comms', x'ffd8', 'Comms weekly', '["2027-02-10","2027-02-09"]', '2027-01-10T00:00:00.000Z')`,
		).run();
		expect((await readPreview(d1, "comms", NOW))?.imageKey).toBe(Date.parse("2027-01-10T00:00:00.000Z").toString(36));
		raw.prepare("UPDATE events SET title = 'Renamed' WHERE slug = 'comms'").run();
		expect((await readPreview(d1, "comms", NOW))?.imageKey).toBeUndefined();
	});

	it("treats expired and unknown events alike", async () => {
		const { raw, d1 } = fakeD1();
		insertEvent(raw, "old", "2027-01-01T00:00:00Z", ["Zofia"]);
		expect(await readPreview(d1, "old", NOW)).toBeNull();
		expect(await readPreview(d1, "nope", NOW)).toBeNull();
	});

	it("falls back to generic tags when D1 fails", async () => {
		const broken = { prepare: () => ({ bind: () => ({ first: () => Promise.reject(new Error("down")) }) }) } as unknown as D1Database;
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await readPreview(broken, "x", NOW)).toBeNull();
		err.mockRestore();
	});
});

describe("servePage routing", () => {
	it("passes non-page requests to the asset server untouched", async () => {
		const seen: Request[] = [];
		const assets = { fetch: async (r: Request) => (seen.push(r), new Response("asset")) } as unknown as Fetcher;
		const db = {} as D1Database;
		for (const [method, path] of [["GET", "/hero/hero.jpg"], ["GET", "/src/main.tsx"], ["POST", "/comms"]] as const) {
			const req = new Request(`https://sowhen.uk${path}`, { method });
			const res = await servePage(req, assets, db);
			expect(await res.text()).toBe("asset");
			expect(seen.at(-1)).toBe(req);
		}
	});
});
