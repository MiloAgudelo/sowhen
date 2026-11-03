// Link previews (ADR 0015): the HTML a chat crawler gets, without running JavaScript.
import { type APIRequestContext, expect, test } from "@playwright/test";
import { createEvent, putResponse, uniqueSlug } from "./helpers";

/** Every <meta property|name=… content=…> in the HTML, as [key, content] pairs (entities decoded). */
function metas(html: string): [string, string][] {
	const out: [string, string][] = [];
	for (const m of html.matchAll(/<meta\b[^>]*>/g)) {
		const key = m[0].match(/\b(?:property|name)="([^"]+)"/)?.[1];
		const content = m[0].match(/\bcontent="([^"]*)"/)?.[1];
		if (key && content !== undefined) out.push([key, decode(content)]);
	}
	return out;
}

function decode(s: string): string {
	return s
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&amp;", "&");
}

/** The single value of a tag; fails if it's missing or duplicated. */
function one(html: string, key: string): string {
	const found = metas(html).filter(([k]) => k === key);
	expect(found, `${key} should appear exactly once`).toHaveLength(1);
	return found[0]![1];
}

async function page(request: APIRequestContext, path: string) {
	const res = await request.get(path);
	expect(res.status()).toBe(200);
	expect(res.headers()["content-type"]).toContain("text/html");
	expect(res.headers()["cache-control"]).toBe("public, max-age=60");
	return res.text();
}

function expectSiteWide(html: string, origin: string) {
	expect(one(html, "og:site_name")).toBe("sowhen");
	expect(one(html, "og:type")).toBe("website");
	expect(one(html, "og:image")).toBe(`${origin}/og/sowhen.png`);
	expect(one(html, "og:image:width")).toBe("1200");
	expect(one(html, "og:image:height")).toBe("630");
	expect(one(html, "og:image:alt")).not.toBe("");
	expect(one(html, "twitter:card")).toBe("summary_large_image");
	expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
	expect(html.match(/<title>/g)).toHaveLength(1);
}

const GENERIC_TITLE = "sowhen: find a time across time zones";

test.describe("link previews", () => {
	test("home page: generic tags, indexable", async ({ request, baseURL }) => {
		const html = await page(request, "/");
		expectSiteWide(html, baseURL!);
		expect(one(html, "og:title")).toBe(GENERIC_TITLE);
		expect(one(html, "og:url")).toBe(`${baseURL}/`);
		expect(metas(html).some(([k]) => k === "robots")).toBe(false);
	});

	test("event page: title, dates in the creator zone and the count, never names @smoke", async ({ request, baseURL }) => {
		const title = `Comms <weekly> & "sync" ${uniqueSlug("t")}`;
		const { event } = await createEvent(request, {
			title,
			creatorZone: "Europe/Warsaw",
			dates: ["2027-02-09", "2027-02-10", "2027-02-11"],
		});
		const slot = event.columns[0]!.slots[0]!;
		await putResponse(request, event.slug, { name: "Zofiawrońska", available: [slot], ifNeeded: [] });
		await putResponse(request, event.slug, { name: "Bartholomew Q", available: [], ifNeeded: [slot] });

		const html = await page(request, `/${event.slug}`);
		expectSiteWide(html, baseURL!);
		expect(one(html, "og:title")).toBe(title);
		expect(one(html, "twitter:title")).toBe(title);
		expect(one(html, "og:description")).toBe(
			"Tue 9 – Thu 11 Feb (Warsaw time) · 2 people have answered · Paint when you're free; everyone sees their own time zone.",
		);
		expect(one(html, "og:url")).toBe(`${baseURL}/${event.slug}`);
		expect(one(html, "robots")).toBe("noindex");
		expect(html).toContain(`<title>Comms &lt;weekly&gt; &amp; &quot;sync&quot;`);
		expect(html).not.toContain("<weekly>");
		expect(html).not.toMatch(/Zofia|Bartholomew/i);
	});

	test("admin page: generic tags and noindex, even for a live event", async ({ request, baseURL }) => {
		const { event } = await createEvent(request, { title: "Secret planning", dates: ["2027-02-10"] });
		const html = await page(request, `/${event.slug}/admin`);
		expectSiteWide(html, baseURL!);
		expect(one(html, "og:title")).toBe(GENERIC_TITLE);
		expect(one(html, "og:url")).toBe(`${baseURL}/${event.slug}/admin`);
		expect(one(html, "robots")).toBe("noindex");
		expect(html).not.toContain("Secret planning");
	});

	test("unknown slug: the same generic tags as home", async ({ request, baseURL }) => {
		const home = await page(request, "/");
		const html = await page(request, "/no-such-event-og-zz");
		expectSiteWide(html, baseURL!);
		expect(one(html, "og:title")).toBe(one(home, "og:title"));
		expect(one(html, "og:description")).toBe(one(home, "og:description"));
		expect(one(html, "robots")).toBe("noindex");
	});
});

test.describe("per-event preview image (ADR 0018)", () => {
	const ogImage = async (request: APIRequestContext, slug: string) =>
		(await (await request.get(`/${slug}`)).text()).match(/og:image" content="([^"]+)"/)?.[1] ?? "";

	test("the admin page draws it for an event without one, and redraws it after a rename", async ({ page, request, baseURL }) => {
		const { event, adminSecret } = await createEvent(request, { dates: ["2030-06-10", "2030-06-11"], title: "Image check" });
		expect(await ogImage(request, event.slug)).toBe(`${baseURL}/og/sowhen.png`);

		await page.goto(`/${event.slug}/admin#${adminSecret}`);
		await expect(page.getByText("Manage event", { exact: true })).toBeVisible();
		await expect.poll(() => ogImage(request, event.slug), { timeout: 15_000 }).toContain(`/api/events/${event.slug}/og-image?k=`);
		const first = await ogImage(request, event.slug);
		const html = await (await request.get(`/${event.slug}`)).text();
		expect(one(html, "og:image:type")).toBe("image/jpeg");
		expect(one(html, "og:image:alt")).toBe("Image check: Mon 10 – Tue 11 Jun. Event on sowhen.");
		const img = await request.get(first);
		expect(img.status()).toBe(200);
		expect(img.headers()["cache-control"]).toBe("public, max-age=86400");

		// Rename: the old image is stale at once (static image again), then the admin page redraws it.
		await page.getByLabel("Event name").fill("Image check renamed");
		await page.getByRole("button", { name: "Save changes" }).click();
		await expect(page.getByText("Event updated", { exact: true })).toBeVisible();
		await expect.poll(() => ogImage(request, event.slug), { timeout: 15_000 }).not.toBe(first);
		await expect.poll(() => ogImage(request, event.slug), { timeout: 15_000 }).toContain("/og-image?k=");
	});

	test("refuses uploads without the admin secret", async ({ request }) => {
		const { event } = await createEvent(request, { dates: ["2030-06-10"] });
		const res = await request.put(`/api/events/${event.slug}/og-image`, {
			headers: { "Content-Type": "image/jpeg" },
			data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
		});
		expect(res.status()).toBe(403);
	});
});

test.describe("static files skip the Worker", () => {
	test("files are served by the asset server with their own type", async ({ request }) => {
		for (const [path, type] of [
			["/hero/hero.jpg", "image/jpeg"],
			["/og/sowhen.png", "image/png"],
			["/favicon.svg", "image/svg+xml"],
		] as const) {
			const res = await request.get(path);
			expect(res.status(), path).toBe(200);
			expect(res.headers()["content-type"], path).toContain(type);
			expect(res.headers()["cache-control"] ?? "", path).not.toContain("max-age=60");
		}
	});

	test("paths under /assets, /hero and /og never reach the Worker", async ({ request }) => {
		// `/<x>/admin` is an admin page to the Worker (noindex, max-age=60). Under the excluded prefixes
		// the asset server answers instead: SPA fallback, index.html untouched (`cf dev` has no built
		// /assets bundle to fetch, so this is how /assets/* is checked here).
		for (const prefix of ["/assets", "/hero", "/og"]) {
			const res = await request.get(`${prefix}/admin`);
			const html = await res.text();
			expect(res.headers()["cache-control"] ?? "", prefix).not.toContain("max-age=60");
			expect(html, prefix).not.toContain('name="robots"');
			expect(html, prefix).toContain("data-page");
		}
	});
});
