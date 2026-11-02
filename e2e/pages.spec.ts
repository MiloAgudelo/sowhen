// Static pages and chrome (ADR 0008, 0011, 0014).
import { expect, test } from "@playwright/test";
import { createEvent, localSql, putResponse, runCron } from "./helpers";

test("unknown slug shows the generic expired page @smoke", async ({ page }) => {
	await page.goto("/no-such-event-e2e-zz");
	await expect(page.getByRole("heading", { name: "This event doesn't exist or has expired" })).toBeVisible();
	await expect(page.getByText("Events are deleted 30 days after their last date.")).toBeVisible();
	await page.getByRole("link", { name: "Create an event" }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole("button", { name: "Create event" })).toBeVisible();
});

test("an event past its expiry shows the same page, and the daily sweep deletes it", async ({ page, request }) => {
	const { event } = await createEvent(request, { dates: ["2027-02-10"] });
	await putResponse(request, event.slug, { name: "Ana", available: [event.columns[0]!.slots[0]!], ifNeeded: [] });
	// Pretend 30 days have passed since the last date (the API won't create a past event).
	await localSql(request, "UPDATE events SET expires_at = ? WHERE slug = ?", ["2001-01-01T00:00:00.000Z", event.slug]);
	await page.goto(`/${event.slug}`);
	await expect(page.getByRole("heading", { name: "This event doesn't exist or has expired" })).toBeVisible();
	expect((await request.get(`/api/events/${event.slug}`)).status()).toBe(404);

	await runCron(request);
	const rows = await localSql(request, "SELECT (SELECT COUNT(*) FROM events WHERE slug = ?1) AS e, (SELECT COUNT(*) FROM responses WHERE event_slug = ?1) AS r", [event.slug]);
	expect(rows.result[0].results.rows[0]).toEqual([0, 0]);
	// The slug is free again.
	expect((await (await request.get(`/api/slugs/${event.slug}`)).json()).available).toBe(true);
});

test("malformed paths show the same page", async ({ page }) => {
	await page.goto("/Not_A_Slug!");
	await expect(page.getByRole("heading", { name: "This event doesn't exist or has expired" })).toBeVisible();
	await page.goto("/some-slug/admin/extra");
	await expect(page.getByRole("heading", { name: "This event doesn't exist or has expired" })).toBeVisible();
});

test("privacy page says what, who, how long and where", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
	await expect(page).toHaveURL(/\/privacy$/);
	await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
	for (const h of ["What we store", "Who can see it", "How long we keep it", "Where it's stored"]) {
		await expect(page.getByRole("heading", { name: h })).toBeVisible();
	}
	await expect(page.getByText("Anyone with the event link")).toBeVisible();
	await expect(page.getByText("30 days after its last date")).toBeVisible();
	await expect(page.getByText(/European Union/)).toBeVisible();
});

test("footer says it is not an official Jamboree tool on every page", async ({ page, request }) => {
	const { event } = await createEvent(request, { dates: ["2027-02-10"] });
	for (const path of ["/", "/privacy", `/${event.slug}`, "/nope-nope-e2e"]) {
		await page.goto(path);
		await expect(page.getByRole("contentinfo")).toContainText("Not an official World Scout Jamboree tool");
	}
});
