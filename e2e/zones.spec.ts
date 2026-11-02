// Time zones (ADR 0001, 0003): local labels, "+1" markers, zone indicator, zone switcher, and
// several people in different zones agreeing on the same best time.
import { expect, type Page, test } from "@playwright/test";
import { ZONES } from "../playwright.config";
import {
	bestSlots,
	createEvent,
	drag,
	getSnapshot,
	hhmm,
	isoDate,
	newContextIn,
	openEvent,
	rangeLabel,
	save,
	setName,
	showPaint,
	showResults,
	slotOf,
	utcOffsetLabel,
} from "./helpers";

const DATE = "2027-02-10"; // Wednesday; nobody in the matrix changes clocks near it
const WARSAW = "Europe/Warsaw";

function rowHeaderFor(page: Page, slot: number) {
	return page.locator(`[role="grid"] [data-slot="${slot}"]`).evaluate((el) => {
		const row = el.getAttribute("data-row");
		const head = el.closest('[role="grid"]')?.querySelector(`[data-rowhead="${row}"]`);
		return (head?.textContent ?? "").replace(/\s+/g, " ").trim();
	});
}

function zoneButton(page: Page) {
	return page.getByRole("combobox", { name: /^Times shown in / });
}

test.describe("labels in the viewer zone", () => {
	for (const zone of ZONES) {
		test(`first and last row labels, column header and indicator in ${zone}`, async ({ browser, request }, testInfo) => {
			const { event } = await createEvent(request, { dates: [DATE], creatorZone: WARSAW });
			const ctx = await newContextIn(browser, testInfo, zone);
			const page = await ctx.newPage();
			await openEvent(page, event.slug);
			const slots = event.columns[0]!.slots;
			const first = slots[0]!;
			const last = slots[slots.length - 1]!;

			// Row labels: viewer-local time, "+1" once the column has crossed the viewer's midnight.
			const firstLabel = await rowHeaderFor(page, first);
			expect(firstLabel).toBe(hhmm(first, zone));
			const lastLabel = await rowHeaderFor(page, last);
			const crosses = isoDate(last, zone) !== isoDate(first, zone);
			expect(lastLabel).toBe(`${hhmm(last, zone)}${crosses ? "+1" : ""}`);

			// Column header: the viewer-local date of the column's first slot.
			const d = new Date(first * 60_000);
			const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, day: "numeric" }).format(d);
			const mon = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short" }).format(d);
			await expect(page.locator("[data-colhead='0']")).toContainText(`${day} ${mon}`);

			// Zone indicator, with the offset that applies during the event.
			const off = utcOffsetLabel(zone, first);
			await expect(zoneButton(page)).toHaveAttribute("aria-label", new RegExp(`\\(${off.replace("+", "\\+")}\\)`));
			await expect(page.getByText("Times in", { exact: true })).toBeVisible();
			await ctx.close();
		});
	}
});

test.describe("Manila viewer of a Warsaw 09:00–18:00 event", () => {
	test.use({ timezoneId: "Asia/Manila" });

	test("shows 16:00–01:00 with +1 after midnight, and the creator zone @smoke", async ({ page, request }) => {
		const { event } = await createEvent(request, { dates: [DATE, "2027-02-12"], creatorZone: WARSAW });
		await openEvent(page, event.slug);
		const s0 = slotOf(DATE, "09:00", WARSAW);
		expect(await rowHeaderFor(page, s0)).toBe("16:00");
		expect(await rowHeaderFor(page, slotOf(DATE, "16:30", WARSAW))).toBe("23:30");
		expect(await rowHeaderFor(page, slotOf(DATE, "17:00", WARSAW))).toBe("00:00+1");
		expect(await rowHeaderFor(page, slotOf(DATE, "17:30", WARSAW))).toBe("00:30+1");
		await expect(zoneButton(page)).toContainText("Manila (UTC+8)");
		await expect(page.getByText("creator zone: Warsaw")).toBeAttached();
		// The slot's own label carries the viewer-local date.
		await expect(page.locator(`[data-slot="${slotOf(DATE, "17:00", WARSAW)}"]`)).toHaveAttribute(
			"aria-label",
			/^Thu 11 Feb 00:00–00:30/,
		);
	});

	test("zone switcher relabels the grid and is remembered", async ({ page, request }) => {
		const { event } = await createEvent(request, { dates: [DATE], creatorZone: WARSAW });
		await openEvent(page, event.slug);
		const s0 = slotOf(DATE, "09:00", WARSAW);
		expect(await rowHeaderFor(page, s0)).toBe("16:00");

		await zoneButton(page).click();
		await page.getByLabel("Search time zones").fill("bogota");
		await page.getByRole("option", { name: /Bogotá/ }).click();
		await expect(zoneButton(page)).toContainText("Bogotá (UTC−5)");
		await expect.poll(() => rowHeaderFor(page, s0)).toBe("03:00");
		await expect(page.locator(`[data-slot="${s0}"]`)).toHaveAttribute("aria-label", /^Wed 10 Feb 03:00–03:30/);

		await page.reload();
		await expect(zoneButton(page)).toContainText("Bogotá");
		expect(await rowHeaderFor(page, s0)).toBe("03:00");

		// The creator's zone is offered first.
		await zoneButton(page).click();
		await expect(page.getByRole("option").first()).toContainText("Warsaw");
		await page.getByRole("option").first().click();
		await expect.poll(() => rowHeaderFor(page, s0)).toBe("09:00");
		await expect(page.getByText("creator zone: Warsaw")).toHaveCount(0);
	});
});

test("zone indicator shows the offset in force during the event, not today's", async ({ browser, request }, testInfo) => {
	// Summer event: Warsaw is UTC+2 then, whatever today's offset is.
	const { event } = await createEvent(request, { dates: ["2027-07-14"], creatorZone: WARSAW });
	const ctx = await newContextIn(browser, testInfo, WARSAW);
	const page = await ctx.newPage();
	await openEvent(page, event.slug);
	await expect(zoneButton(page)).toContainText("Warsaw (UTC+2)");
	await expect(zoneButton(page)).toHaveAttribute("aria-label", /\(UTC\+2\)/);
	await ctx.close();
});

test("four people in four zones agree on the best time @smoke", async ({ browser, request }, testInfo) => {
	test.setTimeout(120_000);
	const { event } = await createEvent(request, {
		dates: [DATE, "2027-02-11"],
		creatorZone: WARSAW,
		window: { start: "09:00", end: "18:00" },
		durationMinutes: 60,
	});
	const u = (h: string) => slotOf(DATE, h, "UTC");
	// Everyone paints in UTC terms; the overlap of all four is 14:30Z–15:30Z (15:30–16:30 Warsaw).
	const people = [
		{ name: "Ola", zone: WARSAW, from: u("13:30"), to: u("16:00") },
		{ name: "Camilo", zone: "America/Bogota", from: u("14:00"), to: u("15:30") },
		{ name: "Maria", zone: "Asia/Manila", from: u("13:00"), to: u("15:00") },
		{ name: "Sita", zone: "Asia/Kathmandu", from: u("14:30"), to: u("16:00") },
	];
	const pages: Page[] = [];
	for (const p of people) {
		const ctx = await newContextIn(browser, testInfo, p.zone);
		const page = await ctx.newPage();
		await openEvent(page, event.slug);
		await showPaint(page);
		await setName(page, p.name);
		await drag(page, testInfo, p.from, p.to);
		await save(page);
		pages.push(page);
	}

	const snap = await getSnapshot(request, event.slug);
	expect(snap.responses).toHaveLength(4);
	const best = { start: u("14:30"), end: u("15:30") };

	for (const [i, page] of pages.entries()) {
		const zone = people[i]!.zone;
		await page.reload();
		await expect(page.getByRole("grid")).toBeVisible();
		await showResults(page);
		await expect(page.getByRole("radio", { name: /Results/ })).toContainText("4");
		const items = await bestSlots(page);
		expect(items[0], `best time seen from ${zone}`).toMatchObject(best);
		expect(items[0]!.text).toContain(rangeLabel(best.start, best.end, zone));
		expect(items[0]!.text).toContain("4 of 4");
		if (zone !== WARSAW) expect(items[0]!.text).toContain("(Warsaw 15:30–16:30)");
		await page.context().close();
	}
});
