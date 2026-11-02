// Responding (ADR 0005, 0006): name, paint by mouse and touch, brushes, save, overwrite by name, delete.
import { expect, test } from "@playwright/test";
import {
	brush,
	cell,
	createEvent,
	drag,
	expectCellState,
	getSnapshot,
	isTouch,
	openEvent,
	putResponse,
	save,
	setName,
	showPaint,
	showResults,
	slotOf,
	slotRange,
	tapCell,
} from "./helpers";

const DATE = "2027-02-10"; // a Wednesday, no DST anywhere in the matrix
const ZONE = "Europe/Warsaw";

test("paint with a drag, add if-needed, erase, save @smoke", async ({ page, request }, testInfo) => {
	const { event } = await createEvent(request, { dates: [DATE, "2027-02-11"], creatorZone: ZONE });
	await openEvent(page, event.slug);
	await showPaint(page);

	const s10 = slotOf(DATE, "10:00", ZONE);
	await setName(page, "Ola");
	await expect(page.getByText("New response. Not you? Add a surname or initial.")).toBeVisible();

	// Available: 10:00–11:30 (3 slots) in the first column.
	await drag(page, testInfo, s10, s10 + 60);
	for (const s of slotRange(s10, 3)) await expectCellState(page, s, "available");
	await expect(page.getByText("Unsaved changes")).toBeVisible();

	// If needed: 12:00–12:30 (2 slots).
	await brush(page, "If needed");
	await drag(page, testInfo, s10 + 120, s10 + 150);
	await expectCellState(page, s10 + 120, "if needed");
	await expectCellState(page, s10 + 150, "if needed");

	// Erase the middle available slot.
	await brush(page, "Erase");
	await drag(page, testInfo, s10 + 30, s10 + 30);
	await expectCellState(page, s10 + 30, "unavailable");

	await save(page);
	// Saving switches to the results tab.
	await expect(page.getByRole("radio", { name: /Results/ })).toHaveAttribute("aria-checked", "true");

	const snap = await getSnapshot(request, event.slug);
	expect(snap.responses).toHaveLength(1);
	expect(snap.responses[0]).toMatchObject({ name: "Ola", available: [s10, s10 + 60], ifNeeded: [s10 + 120, s10 + 150] });
});

test("paint across two columns with one stroke (rectangle)", async ({ page, request }, testInfo) => {
	const { event } = await createEvent(request, { dates: [DATE, "2027-02-11"], creatorZone: ZONE });
	await openEvent(page, event.slug);
	await showPaint(page);
	await setName(page, "Rect");
	const a = slotOf(DATE, "11:00", ZONE);
	const b = slotOf("2027-02-11", "11:30", ZONE);
	await drag(page, testInfo, a, b);
	for (const s of [a, a + 30, b - 30, b]) await expectCellState(page, s, "available");
	await expectCellState(page, a + 60, "unavailable");
});

test("tap paints a single slot (touch) or click (mouse)", async ({ page, request }, testInfo) => {
	const { event } = await createEvent(request, { dates: [DATE], creatorZone: ZONE });
	await openEvent(page, event.slug);
	await showPaint(page);
	await setName(page, "Tapper");
	const s = slotOf(DATE, "14:00", ZONE);
	await tapCell(page, testInfo, s);
	await expectCellState(page, s, "available");
	await expectCellState(page, s + 30, "unavailable");
	// Tapping again with the available brush on an available slot clears it.
	await tapCell(page, testInfo, s);
	await expectCellState(page, s, "unavailable");
	test.info().annotations.push({ type: "input", description: isTouch(testInfo) ? "touchscreen.tap" : "mouse click" });
});

test("overwrite by name with different case and spacing; editing hint; delete own response @smoke", async ({
	page,
	request,
}, testInfo) => {
	const { event } = await createEvent(request, { dates: [DATE], creatorZone: ZONE });
	const s9 = slotOf(DATE, "09:00", ZONE);
	await putResponse(request, event.slug, { name: "anna ", available: [s9, s9 + 30], ifNeeded: [] });
	await putResponse(request, event.slug, { name: "Kenji", available: [s9], ifNeeded: [] });

	await openEvent(page, event.slug);
	await showPaint(page);
	await setName(page, "  Anna ");
	await expect(page.getByText("You're editing anna's response.")).toBeVisible();
	// Her saved slots load into the grid.
	await expectCellState(page, s9, "available");
	await expectCellState(page, s9 + 30, "available");
	await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();

	await drag(page, testInfo, s9 + 120, s9 + 150);
	await save(page);

	let snap = await getSnapshot(request, event.slug);
	expect(snap.responses).toHaveLength(2);
	const anna = snap.responses.find((r) => r.nameKey === "anna");
	expect(anna?.name).toBe("anna"); // the name as first typed is kept
	expect(anna?.available).toEqual([s9, s9 + 30, s9 + 120, s9 + 150]);

	// Delete own response.
	await showPaint(page);
	await page.getByRole("button", { name: "Delete my response" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
	await expect(page.getByText("Response deleted", { exact: true })).toBeVisible();
	snap = await getSnapshot(request, event.slug);
	expect(snap.responses.map((r) => r.name)).toEqual(["Kenji"]);
	await expect(page.getByLabel("Your name")).toHaveValue("  Anna ");
	await expect(page.getByText("New response. Not you? Add a surname or initial.")).toBeVisible();
	await expectCellState(page, s9, "unavailable");
});

test("saving without a name asks for one", async ({ page, request }, testInfo) => {
	const { event } = await createEvent(request, { dates: [DATE], creatorZone: ZONE });
	await openEvent(page, event.slug);
	await showPaint(page);
	const s = slotOf(DATE, "10:00", ZONE);
	await drag(page, testInfo, s, s + 30);
	await page.getByRole("button", { name: "Save my times" }).click();
	await expect(page.getByText("Type your name first, so others know who's free.")).toBeVisible();
	await expect(page.getByLabel("Your name")).toBeFocused();
	expect((await getSnapshot(request, event.slug)).responses).toHaveLength(0);
	await expect(cell(page, s)).toHaveAttribute("aria-selected", "true");
});

test("name is remembered for the event after saving", async ({ page, request }, testInfo) => {
	const { event } = await createEvent(request, { dates: [DATE], creatorZone: ZONE });
	await openEvent(page, event.slug);
	await showPaint(page);
	await setName(page, "Mem");
	const s = slotOf(DATE, "10:00", ZONE);
	await drag(page, testInfo, s, s);
	await save(page);
	await page.reload();
	await expect(page.getByRole("grid")).toBeVisible();
	await showResults(page);
	await showPaint(page);
	await expect(page.getByLabel("Your name")).toHaveValue("Mem");
	await expect(page.getByText("You're editing Mem's response.")).toBeVisible();
	await expectCellState(page, s, "available");
});
