// Results (ADR 0006): best-times ranking, duration filter, highlight in the grid, slot detail.
import { expect, test } from "@playwright/test";
import { bestSlots, bestTimes, cell, createEvent, dayLabel, hhmm, openEvent, putResponse, rangeLabel, scrollIdle, showResults, slotOf, slotRange, tapCell } from "./helpers";

const DATE = "2027-02-10";
const WARSAW = "Europe/Warsaw";
const t = (h: string) => slotOf(DATE, h, WARSAW);

test.use({ timezoneId: "America/New_York" });

async function seed(request: import("@playwright/test").APIRequestContext) {
	const { event } = await createEvent(request, { dates: [DATE], creatorZone: WARSAW, durationMinutes: 60 });
	await putResponse(request, event.slug, { name: "Ana", available: slotRange(t("10:00"), 6), ifNeeded: [] });
	await putResponse(request, event.slug, {
		name: "Ben",
		available: [...slotRange(t("10:00"), 2), ...slotRange(t("12:00"), 2)],
		ifNeeded: [],
	});
	await putResponse(request, event.slug, { name: "Chen", available: slotRange(t("12:00"), 2), ifNeeded: slotRange(t("10:00"), 2) });
	return event;
}

test("best times are ranked by available, then fewer if-needed, then earlier @smoke", async ({ page, request }) => {
	const event = await seed(request);
	await openEvent(page, event.slug);
	// With responses, the page opens on results.
	await expect(page.getByRole("radio", { name: /Results/ })).toHaveAttribute("aria-checked", "true");
	const z = "America/New_York";
	const items = await bestSlots(page);
	expect(items.map(({ start, end }) => ({ start, end }))).toEqual([
		{ start: t("12:00"), end: t("13:00") },
		{ start: t("10:00"), end: t("11:00") },
		{ start: t("10:30"), end: t("12:30") },
	]);
	expect(items[0]!.text).toContain(rangeLabel(t("12:00"), t("13:00"), z));
	expect(items[0]!.text).toContain("(Warsaw 12:00–13:00)");
	expect(items[0]!.text).toContain("3 of 3");
	expect(items[1]!.text).toContain("2 of 3");
	expect(items[1]!.text).toContain("if needed: Chen");
	expect(items[2]!.text).toContain("1 of 3");
	expect(items[2]!.text).toContain("missing: Ben, Chen");
});

test("duration filter changes the list locally", async ({ page, request }) => {
	const event = await seed(request);
	await openEvent(page, event.slug);
	await page.getByRole("radio", { name: "2 h" }).click();
	await expect(page.getByText("Only for you. The event's meeting length stays the same.")).toBeVisible();
	await expect.poll(async () => (await bestSlots(page)).map(({ start, end }) => ({ start, end }))).toEqual([
		{ start: t("10:00"), end: t("13:00") },
	]);
	await page.getByRole("radio", { name: "1 h" }).click();
	await expect.poll(async () => (await bestSlots(page)).length).toBe(3);
});

test("selecting a best time outlines it in the grid", async ({ page, request }) => {
	const event = await seed(request);
	await openEvent(page, event.slug);
	const first = bestTimes(page).first();
	await first.click();
	await expect(first).toHaveAttribute("aria-pressed", "true");
	for (const s of [t("12:00"), t("12:30")]) {
		await expect(cell(page, s)).toHaveAttribute("style", /box-shadow: .*inset/);
	}
	await expect(cell(page, t("11:30"))).not.toHaveAttribute("style", /box-shadow/);
	// Below 1024 px the app smooth-scrolls the grid to the top of the screen on select; let it
	// arrive and settle before tapping again (WebKit's smooth scroll can outlast a quick check).
	if ((page.viewportSize()?.width ?? 1920) < 1024) {
		await expect.poll(async () => (await page.getByRole("grid").boundingBox())?.y ?? 9999).toBeLessThan(120);
	}
	await scrollIdle(page);
	// Two taps on the same spot inside WebKit's double-tap window are taken as a double-tap
	// gesture (no click) in mobile emulation; space them out like a person would.
	await page.waitForTimeout(600);
	await first.click();
	await expect(first).toHaveAttribute("aria-pressed", "false");
	await expect(cell(page, t("12:00"))).not.toHaveAttribute("style", /box-shadow/);
});

test("slot detail lists who is available, if needed and missing", async ({ page, request }, testInfo) => {
	const event = await seed(request);
	await openEvent(page, event.slug);
	await showResults(page);
	const z = "America/New_York";
	const s = t("10:00");
	await expect(cell(page, s)).toHaveAttribute("aria-label", /2 of 3 available, 1 if needed$/);
	await tapCell(page, testInfo, s);
	const panel = page.locator("[aria-live=polite]").filter({ hasText: /^.*Available ·/ }).filter({ visible: true });
	await expect(panel).toContainText(`${dayLabel(s, z)} · ${hhmm(s, z)}–${hhmm(s + 30, z)}`);
	await expect(panel).toContainText("(Warsaw 10:00)");
	await expect(panel).toContainText("Available · 2");
	await expect(panel).toContainText("If needed · 1");
	await expect(panel).toContainText("Missing · 0");
	await expect(panel.getByRole("listitem")).toHaveText(["Ana", "Ben", "Chen"]);
});

test("no responses yet", async ({ page, request }) => {
	const { event } = await createEvent(request, { dates: [DATE] });
	await openEvent(page, event.slug);
	await expect(page.getByRole("radio", { name: /Add your times/ })).toHaveAttribute("aria-checked", "true");
	await showResults(page);
	await expect(page.getByText("No responses yet. Share the link and check back.")).toBeVisible();
});
