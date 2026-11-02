// Admin link (ADR 0007, 0008): edit, responses-affected warning, delete a response, delete the event.
import { expect, test } from "@playwright/test";
import { createEvent, getSnapshot, putResponse, slotOf } from "./helpers";

const WARSAW = "Europe/Warsaw";

test("edit title and dates with a warning, delete a response, delete the event @smoke", async ({ page, request }) => {
	const { event, adminSecret } = await createEvent(request, {
		title: "Before",
		dates: ["2027-02-10", "2027-02-11"],
		creatorZone: WARSAW,
	});
	const s10 = slotOf("2027-02-10", "10:00", WARSAW);
	const s11 = slotOf("2027-02-11", "10:00", WARSAW);
	await putResponse(request, event.slug, { name: "Ana", available: [s10, s11], ifNeeded: [] });
	await putResponse(request, event.slug, { name: "Ben", available: [s10], ifNeeded: [] });
	await putResponse(request, event.slug, { name: "Kenji", available: [s11], ifNeeded: [] });

	await page.goto(`/${event.slug}/admin#${adminSecret}`);
	await expect(page.getByText("Manage event", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Before");
	expect(new URL(page.url()).hash).toBe("");

	// Title.
	await page.getByLabel("Event name").fill("After");
	// Remove Thu 11 Feb: Ana and Kenji painted on it.
	await page.getByRole("button", { name: "Remove Thu 11 Feb 2027" }).click();
	const warning = page.getByRole("alert").filter({ hasText: "will lose painted times" });
	await expect(warning).toContainText("2 of 3 responses will lose painted times (Ana, Kenji)");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("2 responses lost some painted times.", { exact: true })).toBeVisible();
	let snap = await getSnapshot(request, event.slug);
	expect(snap.event.title).toBe("After");
	expect(snap.event.dates).toEqual(["2027-02-10"]);
	expect(snap.responses.find((r) => r.name === "Kenji")?.available).toEqual([]);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("After");

	// Delete a response.
	await page.getByRole("button", { name: "Delete Ben's response" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete response" }).click();
	await expect(page.getByText("Deleted Ben's response", { exact: true })).toBeVisible();
	snap = await getSnapshot(request, event.slug);
	expect(snap.responses.map((r) => r.name).sort()).toEqual(["Ana", "Kenji"]);
	await expect(page.getByRole("heading", { name: "Responses · 2" })).toBeVisible();

	// Delete the event.
	await page.getByRole("button", { name: "Delete event" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete event" }).click();
	await expect(page).toHaveURL(/\/$/);
	expect((await request.get(`/api/events/${event.slug}`)).status()).toBe(404);
	await page.goto(`/${event.slug}`);
	await expect(page.getByRole("heading", { name: "This event doesn't exist or has expired" })).toBeVisible();
	// The slug is free again.
	expect((await (await request.get(`/api/slugs/${event.slug}`)).json()).available).toBe(true);
});

test("changing the window warns too; undo restores the form", async ({ page, request }) => {
	const { event, adminSecret } = await createEvent(request, { dates: ["2027-02-10"], creatorZone: WARSAW });
	await putResponse(request, event.slug, { name: "Ana", available: [slotOf("2027-02-10", "17:00", WARSAW)], ifNeeded: [] });
	await page.goto(`/${event.slug}/admin#${adminSecret}`);
	await expect(page.getByText("Manage event", { exact: true })).toBeVisible();
	await page.getByRole("radio", { name: "Work hours" }).click(); // 09:00–17:00 drops 17:00
	await expect(page.getByRole("alert").filter({ hasText: "will lose painted times" })).toContainText("1 of 1 response");
	await page.getByRole("button", { name: "Undo changes" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "will lose painted times" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("a wrong or missing secret is refused", async ({ page, request }) => {
	const { event } = await createEvent(request, { dates: ["2027-02-10"] });
	await page.goto(`/${event.slug}/admin#not-the-secret`);
	await expect(page.getByRole("heading", { name: "This admin link doesn't work" })).toBeVisible();
	await expect(page.getByText("The code in the link isn't right for this event.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Delete event" })).toHaveCount(0);
	await page.getByRole("button", { name: "Forget the saved link" }).click();
	await expect(page.getByText("Open the full admin link you saved")).toBeVisible();
	await page.getByRole("link", { name: "Go to the event" }).click();
	await expect(page).toHaveURL(new RegExp(`/${event.slug}$`));
	// The API refuses without the right header too.
	expect((await request.delete(`/api/events/${event.slug}`, { headers: { "X-Sowhen-Admin": "nope" } })).status()).toBe(403);
});

test("the creator's browser shows Manage on the event page", async ({ page, request }) => {
	const { event, adminSecret } = await createEvent(request, { dates: ["2027-02-10"] });
	await page.goto(`/${event.slug}/admin#${adminSecret}`);
	await expect(page.getByText("Manage event", { exact: true })).toBeVisible();
	await page.getByRole("link", { name: "Back to event" }).click();
	await expect(page.getByRole("grid")).toBeVisible();
	await page.getByRole("link", { name: /Manage/ }).click();
	await expect(page.getByText("Manage event", { exact: true })).toBeVisible();
});
