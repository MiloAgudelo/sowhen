// Create flow through the UI (ADR 0001, 0004, 0006, 0007).
import { expect, type Page, test } from "@playwright/test";
import { createEvent, getSnapshot, newContextIn, slotOf, uniqueSlug } from "./helpers";

/** YYYY-MM-DD for day `d` of the month after the current one (UTC; the calendar's min is "today"). */
function nextMonthDay(d: number): string {
	const now = new Date();
	const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, d));
	return t.toISOString().slice(0, 10);
}

async function pickTime(page: Page, label: "From" | "To", value: string) {
	await page.getByRole("combobox", { name: label, exact: true }).click();
	await page.getByRole("option", { name: new RegExp(`^${value}`) }).click();
}

test("create an event: slug suggestion, zone, non-consecutive dates, midnight window, duration, admin link @smoke", async ({
	page,
	browser,
}, testInfo) => {
	const rand = Math.random().toString(36).slice(2, 7);
	await page.goto("/");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Find a time that works");

	// Title → slug suggestion.
	await page.getByLabel("Event name").fill(`Comms Weekly Sync ${rand}!`);
	const link = page.getByLabel("Link", { exact: true });
	await expect(link).toHaveValue(`comms-weekly-sync-${rand}`);
	await expect(page.getByText("That link is free.")).toBeVisible();

	// Creator zone.
	await page.getByLabel("Your time zone").click();
	await page.getByLabel("Search time zones").fill("kathmandu");
	await page.getByRole("option", { name: /Kathmandu/ }).click();
	await expect(page.getByLabel("Your time zone")).toContainText("Kathmandu");
	await expect(page.getByText("Times are in Kathmandu time.")).toBeVisible();
	await expect(page.getByRole("listbox", { name: "Time zones" })).toBeHidden();

	// Non-consecutive dates next month.
	await page.getByRole("button", { name: "Next month" }).click();
	const dates = [nextMonthDay(3), nextMonthDay(5), nextMonthDay(9)];
	for (const d of dates) await page.locator(`button[data-date="${d}"]`).click();
	for (const d of dates) await expect(page.locator(`button[data-date="${d}"]`)).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByRole("list", { name: "Chosen dates" }).getByRole("listitem")).toHaveCount(3);

	// Window presets, including 24 h, then a custom window that crosses midnight.
	await page.getByRole("radio", { name: "All day (24 h)" }).click();
	await expect(page.getByText("All day, 24 h")).toBeVisible();
	await page.getByRole("radio", { name: "Work hours" }).click();
	await expect(page.getByText("8 h", { exact: true })).toBeVisible();
	await pickTime(page, "From", "20:00");
	await pickTime(page, "To", "02:00");
	await expect(page.getByText("6 h, ends the next day")).toBeVisible();
	await expect(page.getByText(/For someone in/).first()).toBeVisible();

	// Duration.
	await page.getByRole("radio", { name: "1.5 h" }).click();

	await page.getByRole("button", { name: "Create event" }).click();
	await expect(page.getByRole("heading", { name: "Save your admin link" })).toBeVisible();
	const slug = `comms-weekly-sync-${rand}`;
	const admin = await page.getByLabel("Admin link (keep it private)").inputValue();
	expect(admin).toMatch(new RegExp(`/${slug}/admin#[A-Za-z0-9_-]{16,}$`));
	await expect(page.getByLabel("Share link (send it to your group)")).toHaveValue(new RegExp(`/${slug}$`));

	// What the server stored.
	const snap = await getSnapshot(page.request, slug);
	// Chromium's zone list has the legacy alias "Asia/Katmandu"; both name the same zone.
	expect(snap.event.creatorZone).toMatch(/^Asia\/Kath?mandu$/);
	expect(snap.event).toMatchObject({
		dates,
		window: { start: "20:00", end: "02:00" },
		durationMinutes: 90,
	});
	expect(snap.event.columns.map((c) => c.slots.length)).toEqual([12, 12, 12]);
	expect(snap.event.columns[0]!.slots[0]).toBe(slotOf(dates[0]!, "20:00", "Asia/Kathmandu"));

	// Go to the event.
	await page.getByRole("button", { name: "I've saved it, go to the event" }).click();
	await expect(page).toHaveURL(new RegExp(`/${slug}$`));
	await expect(page.getByRole("heading", { level: 1, name: `Comms Weekly Sync ${rand}!` })).toBeVisible();
	// The creator's browser recognises them.
	await expect(page.getByRole("link", { name: /Manage/ })).toBeVisible();

	// The admin link works in a fresh browser (no localStorage), and the secret leaves the address bar.
	const ctx = await newContextIn(browser, testInfo, "Europe/London");
	const p2 = await ctx.newPage();
	await p2.goto(admin);
	await expect(p2.getByText("Manage event", { exact: true })).toBeVisible();
	await expect(p2.getByRole("heading", { level: 1 })).toHaveText(`Comms Weekly Sync ${rand}!`);
	expect(new URL(p2.url()).hash).toBe("");
	await ctx.close();
});

test("slug clash suggests a free alternative @smoke", async ({ page, request }) => {
	const taken = uniqueSlug("clash");
	await createEvent(request, { slug: taken, dates: ["2027-02-10"] });
	await page.goto("/");
	await page.getByLabel("Event name").fill("Anything");
	await page.getByLabel("Link", { exact: true }).fill(taken);
	await expect(page.getByText("That link is taken.")).toBeVisible();
	const suggestion = page.getByRole("button", { name: `${taken}-2` });
	await expect(suggestion).toBeVisible();
	await suggestion.click();
	await expect(page.getByLabel("Link", { exact: true })).toHaveValue(`${taken}-2`);
	await expect(page.getByText("That link is free.")).toBeVisible();
});

test("reserved and malformed slugs are refused in the form", async ({ page }) => {
	await page.goto("/");
	const link = page.getByLabel("Link", { exact: true });
	await link.fill("admin");
	await expect(page.getByText("That link is reserved.")).toBeVisible();
	await link.fill("a--b");
	await expect(page.getByText("Use 3–48 lowercase letters, numbers and single hyphens.")).toBeVisible();
});

test("a 24 h window gives 48 slots a day; submitting empty shows errors", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Create event" }).click();
	await expect(page.getByText("Give your event a name.")).toBeVisible();
	await expect(page.getByText("Pick at least one date.")).toBeVisible();

	const slug = uniqueSlug("allday");
	await page.getByLabel("Event name").fill("All day");
	await page.getByLabel("Link", { exact: true }).fill(slug);
	await expect(page.getByText("That link is free.")).toBeVisible();
	await page.getByRole("button", { name: "Next month" }).click();
	await page.locator(`button[data-date="${nextMonthDay(12)}"]`).click();
	await page.getByRole("radio", { name: "All day (24 h)" }).click();
	await page.getByRole("button", { name: "Create event" }).click();
	await expect(page.getByRole("heading", { name: "Save your admin link" })).toBeVisible();
	const snap = await getSnapshot(page.request, slug);
	expect(snap.event.window).toEqual({ start: "00:00", end: "00:00" });
	// 48 unless the browser zone has a DST change that day.
	expect([46, 48, 50]).toContain(snap.event.columns[0]!.slots.length);
});
