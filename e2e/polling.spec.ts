// Live updates by polling (ADR 0009): others' answers arrive while you paint; your draft survives.
// There is no test hook to speed polling up, so this waits for the real 15 s poll.
import { expect, test } from "@playwright/test";
import { cell, createEvent, drag, expectCellState, getSnapshot, newContextIn, openEvent, save, setName, showPaint, showResults, slotOf, tab } from "./helpers";

const DATE = "2027-02-10";
const WARSAW = "Europe/Warsaw";

test("another person's save appears without reload, and the unsaved draft survives @smoke", async ({
	browser,
	request,
}, testInfo) => {
	test.setTimeout(90_000);
	const { event } = await createEvent(request, { dates: [DATE], creatorZone: WARSAW });
	const a = await (await newContextIn(browser, testInfo, "Asia/Manila")).newPage();
	const b = await (await newContextIn(browser, testInfo, "America/Bogota")).newPage();
	await openEvent(a, event.slug);
	await openEvent(b, event.slug);

	// A paints but does not save.
	await showPaint(a);
	await setName(a, "Alice");
	const sa = slotOf(DATE, "10:00", WARSAW);
	await drag(a, testInfo, sa, sa + 30);
	await expectCellState(a, sa, "available");
	await expect(tab(a, "results")).toContainText("1"); // her own draft counts locally

	// B saves.
	await showPaint(b);
	await setName(b, "Bob");
	const sb = slotOf(DATE, "14:00", WARSAW);
	await drag(b, testInfo, sb, sb + 60);
	await save(b);

	// Within one poll, A sees Bob without reloading, and keeps her draft.
	await expect(tab(a, "results")).toContainText("2", { timeout: 25_000 });
	await expectCellState(a, sa, "available");
	await expectCellState(a, sa + 30, "available");
	await expect(a.getByText("Unsaved changes")).toBeVisible();
	await showResults(a);
	await expect(a.getByText("Bob", { exact: true }).first()).toBeVisible();
	await expect(cell(a, sb)).toHaveAttribute("aria-label", /1 of 2 available/);
	await expect(cell(a, sa)).toHaveAttribute("aria-label", /1 of 2 available/);

	// A saves; both answers are on the server.
	await showPaint(a);
	await save(a);
	const snap = await getSnapshot(request, event.slug);
	expect(snap.responses.map((r) => r.name).sort()).toEqual(["Alice", "Bob"]);

	// And B gets Alice by polling too.
	await showResults(b);
	await expect(tab(b, "results")).toContainText("2", { timeout: 25_000 });
	await a.context().close();
	await b.context().close();
});
