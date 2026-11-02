// Accessibility (ADR 0012): axe on the main screens; no serious or critical violations.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createEvent, drag, openEvent, putResponse, setName, showPaint, showResults, slotOf } from "./helpers";

async function checkAxe(page: Page, name: string) {
	const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
	const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
	const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`);
	expect(summary, `${name}: serious/critical axe violations`).toEqual([]);
}

const DATE = "2027-02-10";
const WARSAW = "Europe/Warsaw";

test("create page @smoke", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("button", { name: "Create event" })).toBeVisible();
	await checkAxe(page, "create");
	// With validation errors showing.
	await page.getByRole("button", { name: "Create event" }).click();
	await expect(page.getByText("Give your event a name.")).toBeVisible();
	await checkAxe(page, "create with errors");
});

test("event page: paint and results @smoke", async ({ page, request }, testInfo) => {
	const { event } = await createEvent(request, { dates: [DATE, "2027-02-12"], creatorZone: WARSAW });
	const s = slotOf(DATE, "10:00", WARSAW);
	await putResponse(request, event.slug, { name: "Ana", available: [s, s + 30], ifNeeded: [s + 60] });
	await openEvent(page, event.slug);
	await showPaint(page);
	await setName(page, "Ana");
	await drag(page, testInfo, s + 90, s + 120);
	await checkAxe(page, "event paint");
	await showResults(page);
	await page.locator("button[data-best-start]").first().click();
	await checkAxe(page, "event results");
});

test("admin page", async ({ page, request }) => {
	const { event, adminSecret } = await createEvent(request, { dates: [DATE] });
	await putResponse(request, event.slug, { name: "Ana", available: [slotOf(DATE, "17:00", WARSAW)], ifNeeded: [] });
	await page.goto(`/${event.slug}/admin#${adminSecret}`);
	await expect(page.getByText("Manage event", { exact: true })).toBeVisible();
	await checkAxe(page, "admin");
	await page.getByRole("radio", { name: "Work hours" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "will lose painted times" })).toBeVisible();
	await checkAxe(page, "admin with warning");
});

test("privacy and not-found pages", async ({ page }) => {
	await page.goto("/privacy");
	await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
	await checkAxe(page, "privacy");
	await page.goto("/no-such-event-e2e");
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	await checkAxe(page, "not found");
});
