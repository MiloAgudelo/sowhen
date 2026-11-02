// Daylight saving inside an event (ADR 0001, 0003): 2027 changes are US Mar 14, EU Mar 28,
// EU Oct 31, US Nov 7. The generated slot list is the truth; viewers get a shift notice.
import { expect, test } from "@playwright/test";
import { createEvent, dayLabel, hhmm, newContextIn, openEvent, offsetAt, slotOf } from "./helpers";

const WARSAW = "Europe/Warsaw";

function shiftSlots(slots: number[], viewer: string, creator: string): number[] {
	const out: number[] = [];
	let prev: number | undefined;
	for (const s of slots) {
		const d = offsetAt(viewer, s * 60_000) - offsetAt(creator, s * 60_000);
		if (prev !== undefined && d !== prev) out.push(s);
		prev = d;
	}
	return out;
}

const notice = (page: import("@playwright/test").Page) =>
	page.getByRole("note").filter({ hasText: "Daylight saving changes during this event" }).first();

test("Warsaw 24 h window on 2027-03-28 has 46 slots; 2027-10-31 has 50 @smoke", async ({ browser, request }, testInfo) => {
	const { event } = await createEvent(request, {
		dates: ["2027-03-27", "2027-03-28", "2027-10-31"],
		creatorZone: WARSAW,
		window: { start: "00:00", end: "00:00" },
	});
	expect(event.columns.map((c) => c.slots.length)).toEqual([48, 46, 50]);

	const ctx = await newContextIn(browser, testInfo, WARSAW);
	const page = await ctx.newPage();
	await openEvent(page, event.slug);
	for (const [i, n] of [48, 46, 50].entries()) {
		await expect(page.locator(`[role="grid"] [data-col="${i}"][data-slot]`)).toHaveCount(n);
	}
	// The short day is drawn with placeholders, never invented slots.
	await expect(page.getByRole("gridcell", { name: "No time slot here (clock change)" }).first()).toBeAttached();
	// The repeated 02:00–03:00 on Oct 31 shows twice in the creator's own zone.
	const oct = event.columns[2]!.slots;
	const labels = oct.map((s) => hhmm(s, WARSAW));
	expect(labels.filter((l) => l === "02:30")).toHaveLength(2);
	// A Warsaw viewer of a Warsaw event gets no shift notice.
	await expect(notice(page)).toHaveCount(0);
	await ctx.close();
});

for (const [season, dates] of [
	["spring", ["2027-03-12", "2027-03-15", "2027-03-26", "2027-03-29"]],
	["autumn", ["2027-10-29", "2027-11-01", "2027-11-05", "2027-11-08"]],
] as const) {
	for (const viewer of ["America/New_York", "America/Bogota", "Europe/London", "Asia/Kolkata"]) {
		test(`${season} event in Warsaw seen from ${viewer}: per-column labels and shift notice`, async ({
			browser,
			request,
		}, testInfo) => {
			const { event } = await createEvent(request, { dates: [...dates], creatorZone: WARSAW });
			const ctx = await newContextIn(browser, testInfo, viewer);
			const page = await ctx.newPage();
			await openEvent(page, event.slug);

			const all = event.columns.flatMap((c) => c.slots);
			const shifts = shiftSlots(all, viewer, WARSAW);
			if (shifts.length === 0) {
				await expect(notice(page)).toHaveCount(0);
			} else {
				const parts = shifts.map((s) => {
					const i = all.indexOf(s);
					const prev = all[i - 1]!;
					const rel = (x: number) => offsetAt(viewer, x * 60_000) - offsetAt(WARSAW, x * 60_000);
					const delta = Math.abs(rel(s) - rel(prev));
					return `by ${delta % 60 === 0 ? `${delta / 60} h` : `${delta} min`} from ${dayLabel(s, viewer)}`;
				});
				await expect(notice(page)).toContainText(
					`your local times shift ${parts.join(", and ")}, compared with Warsaw time.`,
				);
			}

			// The first slot of every column is labelled with its own viewer-local time.
			for (const [i, col] of event.columns.entries()) {
				const first = col.slots[0]!;
				const expected = hhmm(first, viewer);
				const c = page.locator(`[role="grid"] [data-slot="${first}"]`);
				await expect(c).toHaveAttribute("aria-label", new RegExp(` ${expected}–`));
				if (i > 0 && hhmm(event.columns[0]!.slots[0]!, viewer) !== expected) {
					// Differs from the gutter label, so the cell shows its own time.
					await expect(c).toHaveText(expected);
				}
			}
			await ctx.close();
		});
	}
}

test("EU spring-forward day for a New York viewer: the short column keeps every real slot", async ({
	browser,
	request,
}, testInfo) => {
	const { event } = await createEvent(request, {
		dates: ["2027-03-27", "2027-03-28"],
		creatorZone: WARSAW,
		window: { start: "01:00", end: "04:00" },
	});
	// 01:00–04:00 Warsaw on Mar 28 is 01:00, 01:30, then 03:00, 03:30 (02:00–03:00 doesn't exist).
	expect(event.columns.map((c) => c.slots.length)).toEqual([6, 4]);
	const ctx = await newContextIn(browser, testInfo, "America/New_York");
	const page = await ctx.newPage();
	await openEvent(page, event.slug);
	await expect(page.locator('[role="grid"] [data-col="1"][data-slot]')).toHaveCount(4);
	const s = slotOf("2027-03-28", "03:00", WARSAW);
	await expect(page.locator(`[data-slot="${s}"]`)).toHaveAttribute("aria-label", new RegExp(` ${hhmm(s, "America/New_York")}–`));
	await expect(notice(page)).toContainText("Daylight saving changes during this event");
	await ctx.close();
});
