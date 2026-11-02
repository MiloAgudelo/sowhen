// Layout at every viewport: no horizontal page overflow (the grid scrolls inside its own box), and
// key controls visible and big enough to tap on touch devices.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createEvent, isTouch, openEvent, putResponse, showPaint, showResults, slotOf } from "./helpers";

const DATE = "2027-02-10";
const WARSAW = "Europe/Warsaw";
const MIN_TAP = 32;

async function expectNoHorizontalOverflow(page: Page, where: string) {
	const { scroll, client } = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth,
		client: document.documentElement.clientWidth,
	}));
	expect(scroll, `${where}: page is ${scroll}px wide in a ${client}px viewport`).toBeLessThanOrEqual(client);
}

async function expectTappable(controls: [string, Locator][], touch: boolean) {
	for (const [name, loc] of controls) {
		await expect(loc, name).toBeVisible();
		if (!touch) continue;
		const box = await loc.boundingBox();
		expect(box, name).not.toBeNull();
		expect(Math.round(box!.height), `${name} height`).toBeGreaterThanOrEqual(MIN_TAP);
		expect(Math.round(box!.width), `${name} width`).toBeGreaterThanOrEqual(MIN_TAP);
	}
}

test("create page @smoke", async ({ page }, testInfo) => {
	await page.goto("/");
	await expectNoHorizontalOverflow(page, "create");
	await page.getByRole("button", { name: "Next month" }).click();
	await expectTappable(
		[
			["event name", page.getByLabel("Event name")],
			["zone picker", page.getByLabel("Your time zone")],
			["next month", page.getByRole("button", { name: "Next month" })],
			["a date", page.locator("button[data-date]").nth(10)],
			["24 h preset", page.getByRole("radio", { name: "All day (24 h)" })],
			["from", page.getByRole("combobox", { name: "From", exact: true })],
			["duration 1 h", page.getByRole("radio", { name: "1 h", exact: true })],
			["create", page.getByRole("button", { name: "Create event" })],
		],
		isTouch(testInfo),
	);
	await page.locator("button[data-date]").nth(10).scrollIntoViewIfNeeded();
	await page.locator("button[data-date]").nth(10).click();
	await expectNoHorizontalOverflow(page, "create with a date");
});

test("event page, paint and results, with a wide event @smoke", async ({ page, request }, testInfo) => {
	// Seven dates and a 24 h window: the grid must scroll inside its box, not the page.
	const dates = ["2027-02-08", "2027-02-09", "2027-02-10", "2027-02-11", "2027-02-12", "2027-02-15", "2027-02-16"];
	const { event } = await createEvent(request, {
		title: "A long event title that should wrap nicely on small phones without overflowing",
		dates,
		creatorZone: WARSAW,
		window: { start: "00:00", end: "00:00" },
	});
	const s = slotOf(DATE, "10:00", WARSAW);
	await putResponse(request, event.slug, { name: "Ana", available: [s, s + 30], ifNeeded: [] });
	await openEvent(page, event.slug);
	await showPaint(page);
	await expectNoHorizontalOverflow(page, "event paint");
	await expectTappable(
		[
			["paint tab", page.getByRole("radio", { name: /Add your times/ })],
			["results tab", page.getByRole("radio", { name: /Results/ })],
			["name", page.getByLabel("Your name")],
			["brush available", page.getByRole("radio", { name: "Available" })],
			["brush if needed", page.getByRole("radio", { name: "If needed" })],
			["brush erase", page.getByRole("radio", { name: "Erase" })],
			["save", page.getByRole("button", { name: "Save my times" })],
			["zone switcher", page.getByRole("combobox", { name: /^Times shown in / })],
		],
		isTouch(testInfo),
	);
	// The grid scrolls inside its own box.
	const grid = page.getByRole("grid");
	const { gridW, boxW } = await grid.evaluate((g) => ({ gridW: g.scrollWidth, boxW: g.parentElement!.clientWidth }));
	if (gridW > boxW) {
		const scroller = await grid.evaluate((g) => getComputedStyle(g.parentElement!).overflowX);
		expect(scroller).toBe("auto");
	}

	await showResults(page);
	await expectNoHorizontalOverflow(page, "event results");
	await expectTappable(
		[
			["best time", page.locator("button[data-best-start]").first()],
			["duration 2 h", page.getByRole("radio", { name: "2 h" })],
		],
		isTouch(testInfo),
	);
});

test("admin, privacy and not-found pages", async ({ page, request }, testInfo) => {
	const { event, adminSecret } = await createEvent(request, { dates: [DATE] });
	await putResponse(request, event.slug, { name: "Ana", available: [slotOf(DATE, "10:00", WARSAW)], ifNeeded: [] });
	await page.goto(`/${event.slug}/admin#${adminSecret}`);
	await expect(page.getByText("Manage event", { exact: true })).toBeVisible();
	await expectNoHorizontalOverflow(page, "admin");
	await expectTappable(
		[
			["save", page.getByRole("button", { name: "Save changes" })],
			["delete response", page.getByRole("button", { name: "Delete Ana's response" })],
			["delete event", page.getByRole("button", { name: "Delete event" })],
		],
		isTouch(testInfo),
	);
	await page.goto("/privacy");
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	await expectNoHorizontalOverflow(page, "privacy");
	await page.goto("/no-such-e2e-event");
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	await expectNoHorizontalOverflow(page, "not found");
});
