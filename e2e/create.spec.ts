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

test("drag across the calendar to pick or drop several days; the keyboard still toggles one", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Next month" }).click();
	// The first Monday of next month and the two days after it sit in one calendar row.
	let monday = 1;
	while (new Date(`${nextMonthDay(monday)}T00:00:00Z`).getUTCDay() !== 1) monday++;
	const week = [nextMonthDay(monday), nextMonthDay(monday + 1), nextMonthDay(monday + 2)];
	const day = (iso: string) => page.locator(`button[data-date="${iso}"]`);
	const chosen = page.getByRole("list", { name: "Chosen dates" }).getByRole("listitem");
	const total = page.getByText(/^\d+ days?$/);

	const drag = async (from: string, to: string) => {
		await day(to).scrollIntoViewIfNeeded();
		const a = await day(from).boundingBox();
		const b = await day(to).boundingBox();
		if (!a || !b) throw new Error("calendar day not on screen");
		await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
		await page.mouse.down();
		await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
		await page.mouse.up();
	};

	await drag(week[0]!, week[2]!);
	for (const d of week) await expect(day(d)).toHaveAttribute("aria-pressed", "true");
	// Consecutive days show as one range.
	await expect(chosen).toHaveCount(1);
	await expect(total).toHaveText("3 days");

	// Starting on a chosen day removes instead.
	await drag(week[1]!, week[2]!);
	await expect(day(week[0]!)).toHaveAttribute("aria-pressed", "true");
	await expect(day(week[1]!)).toHaveAttribute("aria-pressed", "false");
	await expect(day(week[2]!)).toHaveAttribute("aria-pressed", "false");
	await expect(total).toHaveText("1 day");

	// A plain click and the keyboard each toggle exactly one day.
	await day(week[1]!).click();
	await expect(total).toHaveText("2 days");
	await day(week[1]!).press("Enter");
	await expect(day(week[1]!)).toHaveAttribute("aria-pressed", "false");
	await expect(total).toHaveText("1 day");

	// Removing a range chip drops all its days.
	await drag(week[2]!, week[0]!);
	await expect(total).toHaveText("3 days");
	await chosen.getByRole("button").click();
	for (const d of week) await expect(day(d)).toHaveAttribute("aria-pressed", "false");
	await expect(chosen).toHaveCount(0);
});

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
	// Chromium reports the old name "Asia/Katmandu"; the app and the server store the current one (ADR 0016).
	expect(snap.event.creatorZone).toBe("Asia/Kathmandu");
	expect(snap.event).toMatchObject({
		dates,
		window: { start: "20:00", end: "02:00" },
		durationMinutes: 90,
	});
	expect(snap.event.columns.map((c) => c.slots.length)).toEqual([12, 12, 12]);
	expect(snap.event.columns[0]!.slots[0]).toBe(slotOf(dates[0]!, "20:00", "Asia/Kathmandu"));

	// The creator's browser drew and uploaded the event's own preview image (ADR 0018).
	await expect
		.poll(async () => (await (await page.request.get(`/${slug}`)).text()).match(/og:image" content="([^"]+)"/)?.[1] ?? "", {
			timeout: 15_000,
		})
		.toContain(`/api/events/${slug}/og-image?k=`);
	const image = await page.request.get(`/api/events/${slug}/og-image`);
	expect(image.status()).toBe(200);
	expect(image.headers()["content-type"]).toBe("image/jpeg");
	expect((await image.body()).length).toBeGreaterThan(20_000);

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
