// Shared helpers for the e2e suite. Expected labels are computed here in Node with Intl, a separate
// code path from the app's Temporal-based display code, so the tests check the app independently.
import {
	type APIRequestContext,
	type Browser,
	type BrowserContext,
	type Locator,
	type Page,
	type TestInfo,
	expect,
} from "@playwright/test";
import type { CreateEventInput, CreateEventResult, PutResponseInput } from "../src/shared/api";
import type { EventSnapshot, SlotId } from "../src/shared/types";

// ---- Ids and API fixtures

export function uniqueSlug(prefix = "e2e"): string {
	const rnd = Math.random().toString(36).slice(2, 8);
	return `${prefix}-${Date.now().toString(36)}-${rnd}`.slice(0, 48);
}

export async function createEvent(
	request: APIRequestContext,
	input: Partial<CreateEventInput> & Pick<CreateEventInput, "dates">,
): Promise<CreateEventResult> {
	const body: CreateEventInput = {
		slug: uniqueSlug(),
		title: "E2E event",
		creatorZone: "Europe/Warsaw",
		window: { start: "09:00", end: "18:00" },
		durationMinutes: 60,
		...input,
	};
	const res = await request.post("/api/events", { data: body });
	expect(res.status(), await res.text()).toBe(201);
	return (await res.json()) as CreateEventResult;
}

export async function putResponse(request: APIRequestContext, slug: string, input: PutResponseInput) {
	const res = await request.put(`/api/events/${slug}/responses`, { data: input });
	expect(res.status(), await res.text()).toBe(200);
	return res.json();
}

export async function getSnapshot(request: APIRequestContext, slug: string): Promise<EventSnapshot> {
	const res = await request.get(`/api/events/${slug}`);
	expect(res.status()).toBe(200);
	return (await res.json()) as EventSnapshot;
}

// ---- Time maths (independent of src/domain)

/** Offset of `zone` at `ms`, in minutes east of UTC. */
export function offsetAt(zone: string, ms: number): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).formatToParts(new Date(ms));
	const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
	const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
	return Math.round((asUtc - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/** Epoch minutes (SlotId) of wall time `date` `time` in `zone`. */
export function slotOf(date: string, time: string, zone: string): SlotId {
	const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
	const [h, mi] = time.split(":").map(Number) as [number, number];
	const wall = Date.UTC(y, mo - 1, d, h, mi);
	let ms = wall - offsetAt(zone, wall) * 60_000;
	ms = wall - offsetAt(zone, ms) * 60_000;
	return ms / 60_000;
}

/** "15:00" in `zone`. */
export function hhmm(slot: SlotId, zone: string): string {
	return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
		new Date(slot * 60_000),
	);
}

/** "2027-03-10" in `zone`. */
export function isoDate(slot: SlotId, zone: string): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
		new Date(slot * 60_000),
	);
}

/** "Tue 10 Nov" in `zone`. */
export function dayLabel(slot: SlotId, zone: string): string {
	const d = new Date(slot * 60_000);
	const wd = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }).format(d);
	const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, day: "numeric" }).format(d);
	const mon = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short" }).format(d);
	return `${wd} ${day} ${mon}`;
}

/** Best-time label as the list shows it: "Tue 10 Nov 15:00–16:00", "+1" when it ends the next day. */
export function rangeLabel(start: SlotId, end: SlotId, zone: string): string {
	const a = hhmm(start, zone);
	const b = hhmm(end, zone);
	const sameDay = isoDate(start, zone) === isoDate(end, zone);
	const endTxt = b === "00:00" && isoDate(start, zone) === isoDate(end - 1, zone) ? "24:00" : b;
	return `${dayLabel(start, zone)} ${a}–${endTxt}${sameDay || endTxt === "24:00" ? "" : " +1"}`;
}

/** "UTC+5:45", "UTC−5" (U+2212). */
export function utcOffsetLabel(zone: string, slot: SlotId): string {
	const m = offsetAt(zone, slot * 60_000);
	if (m === 0) return "UTC";
	const sign = m < 0 ? "−" : "+";
	const abs = Math.abs(m);
	return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
}

export function slotRange(start: SlotId, count: number): SlotId[] {
	return Array.from({ length: count }, (_, i) => start + 30 * i);
}

/** A future date in the creator zone, `days` from today (keeps UI-created events valid). */
export function futureDate(days: number): string {
	const d = new Date(Date.now() + days * 86_400_000);
	return d.toISOString().slice(0, 10);
}

// ---- Project info

export const isTouch = (testInfo: TestInfo) => !!testInfo.project.use.hasTouch;
export const engine = (testInfo: TestInfo) => testInfo.project.use.browserName ?? "chromium";

/** A new context with the current project's device settings but its own zone (multi-person tests). */
export async function newContextIn(browser: Browser, testInfo: TestInfo, timezoneId: string): Promise<BrowserContext> {
	const u = testInfo.project.use;
	return browser.newContext({
		baseURL: u.baseURL,
		viewport: u.viewport,
		userAgent: u.userAgent,
		deviceScaleFactor: u.deviceScaleFactor,
		isMobile: u.isMobile,
		hasTouch: u.hasTouch,
		locale: u.locale,
		timezoneId,
	});
}

// ---- Event page

export async function openEvent(page: Page, slug: string) {
	await page.goto(`/${slug}`);
	await expect(page.getByRole("grid")).toBeVisible();
}

export function tab(page: Page, which: "paint" | "results"): Locator {
	return page.getByRole("radio", { name: which === "paint" ? /Add your times/ : /Results/ });
}

export async function showPaint(page: Page) {
	const t = tab(page, "paint");
	if ((await t.getAttribute("aria-checked")) !== "true") await t.click();
	await expect(page.getByRole("grid")).toHaveAttribute("aria-multiselectable", "true");
}

export async function showResults(page: Page) {
	const t = tab(page, "results");
	if ((await t.getAttribute("aria-checked")) !== "true") await t.click();
	await expect(page.getByRole("grid")).not.toHaveAttribute("aria-multiselectable", "true");
}

export function cell(page: Page, slot: SlotId): Locator {
	return page.locator(`[role="grid"] [data-slot="${slot}"]`);
}

export async function brush(page: Page, name: "Available" | "If needed" | "Erase") {
	await page.getByRole("radiogroup", { name: "Brush" }).getByRole("radio", { name }).click();
}

/** Centre a cell inside the grid's own scroller and the page, away from sticky header/footer. */
async function centre(loc: Locator) {
	await loc.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
}

async function centreOf(loc: Locator) {
	const b = await loc.boundingBox();
	if (!b) throw new Error("cell has no box");
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/**
 * Paint from slot `from` to slot `to` (a rectangle, same as a real drag). Mouse on desktop projects;
 * on touch projects a touch drag: CDP touch events in Chromium (the browser's real touch pipeline),
 * synthetic `pointerType: "touch"` PointerEvents in Firefox and WebKit (Playwright has no touch-drag
 * API there).
 */
export async function drag(page: Page, testInfo: TestInfo, from: SlotId, to: SlotId) {
	const a = cell(page, from);
	const b = cell(page, to);
	await centre(a);
	// Scroll the grid so the middle of the stroke is centred: both ends stay on screen, away from the
	// auto-scroll edges (as a person would position the grid before dragging).
	await a.evaluate((el, toSlot) => {
		const grid = el.closest('[role="grid"]');
		const scroller = grid?.parentElement;
		const end = grid?.querySelector(`[data-slot="${toSlot}"]`);
		if (!scroller || !end) return;
		const ra = el.getBoundingClientRect();
		const rb = end.getBoundingClientRect();
		scroller.scrollTop += (rb.top - ra.top) / 2;
		scroller.scrollLeft += (rb.left - ra.left) / 2;
	}, to);
	const pa = await centreOf(a);
	const pb = await centreOf(b);
	const steps = 6;
	const path = Array.from({ length: steps + 1 }, (_, i) => ({
		x: pa.x + ((pb.x - pa.x) * i) / steps,
		y: pa.y + ((pb.y - pa.y) * i) / steps,
	}));
	if (!isTouch(testInfo)) {
		await page.mouse.move(pa.x, pa.y);
		await page.mouse.down();
		for (const p of path.slice(1)) await page.mouse.move(p.x, p.y);
		await page.mouse.up();
		return;
	}
	if (engine(testInfo) === "chromium") {
		const cdp = await page.context().newCDPSession(page);
		const pt = (p: { x: number; y: number }) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
		await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(pa) });
		for (const p of path.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(p) });
		await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await cdp.detach();
		return;
	}
	await page.evaluate((pts) => {
		const fire = (type: string, x: number, y: number, target?: Element | null) => {
			const el = target ?? document.elementFromPoint(x, y);
			if (!el) throw new Error(`nothing at ${x},${y}`);
			el?.dispatchEvent(
				new PointerEvent(type, {
					bubbles: true,
					cancelable: true,
					composed: true,
					pointerId: 11,
					pointerType: "touch",
					isPrimary: true,
					clientX: x,
					clientY: y,
					button: 0,
					buttons: type === "pointerup" ? 0 : 1,
					width: 10,
					height: 10,
					pressure: type === "pointerup" ? 0 : 0.5,
				}),
			);
		};
		const first = pts[0]!;
		const last = pts[pts.length - 1]!;
		const start = document.elementFromPoint(first.x, first.y);
		// The grid captures the pointer on pointerdown, so later events go to the grid itself.
		const grid = start?.closest('[role="grid"]') ?? null;
		fire("pointerdown", first.x, first.y, start);
		for (const p of pts.slice(1)) fire("pointermove", p.x, p.y, grid);
		fire("pointerup", last.x, last.y, grid);
	}, path);
}

/** Tap (touch) or click (mouse) a single cell. Uses Playwright's real touch tap on touch projects. */
export async function tapCell(page: Page, testInfo: TestInfo, slot: SlotId) {
	const c = cell(page, slot);
	await centre(c);
	if (isTouch(testInfo)) {
		const p = await centreOf(c);
		await page.touchscreen.tap(p.x, p.y);
	} else {
		await c.click();
	}
}

export async function expectCellState(page: Page, slot: SlotId, state: "available" | "if needed" | "unavailable") {
	await expect(cell(page, slot)).toHaveAttribute("aria-label", new RegExp(`, ${state}$`));
}

export async function setName(page: Page, name: string) {
	const input = page.getByLabel("Your name");
	await input.fill(name);
}

export async function save(page: Page) {
	await page.getByRole("button", { name: /^(Save my times|Save changes)$/ }).click();
	await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
}

/** The `[data-best-start]` buttons of the best-times list, in rank order. */
export function bestTimes(page: Page): Locator {
	return page.locator("button[data-best-start]");
}

export async function bestSlots(page: Page): Promise<{ start: number; end: number; text: string }[]> {
	return bestTimes(page).evaluateAll((els) =>
		els.map((e) => ({
			start: Number(e.getAttribute("data-best-start")),
			end: Number(e.getAttribute("data-best-end")),
			text: (e.textContent ?? "").replace(/\s+/g, " ").trim(),
		})),
	);
}

// ---- Local-only test hooks: the dev server's Local Explorer API (miniflare, port 5199 only)

const EXPLORER = "/cdn-cgi/local/explorer/api";
const LOCAL_DB_ID = "00000000-0000-4000-8000-000000000001";

/** Run SQL against the local e2e D1 (never the real database: this route exists only in `cf dev`). */
export async function localSql(request: APIRequestContext, sql: string, params: unknown[] = []) {
	const res = await request.post(`${EXPLORER}/d1/database/${LOCAL_DB_ID}/raw`, { data: { sql, params } });
	expect(res.status(), await res.text()).toBe(200);
	return res.json();
}

/**
 * Fire the Worker's daily cron (ADR 0008 sweep) once through the Local Explorer. Returns false when
 * the explorer refuses with 502 "The owner of Worker is unavailable": cf dev's scheduled dispatch
 * is unreliable on this setup (it fails on a fresh server and works only some of the time), and
 * the sweep itself is unit-tested in src/worker/api.test.ts.
 */
export async function runCron(request: APIRequestContext): Promise<boolean> {
	for (let i = 0; i < 3; i++) {
		const res = await request.post(`${EXPLORER}/local/scheduled?worker=sowhen`, { data: { cron: "17 3 * * *" } });
		if (res.status() === 200) return true;
		const body = await res.text();
		expect(body).toContain("is unavailable");
		await new Promise((r) => setTimeout(r, 1000));
	}
	return false;
}

/** Wait until the page has stopped (smooth-)scrolling, e.g. after the app scrolls the grid into view. */
export async function scrollIdle(page: Page) {
	let last = -1;
	await expect
		.poll(async () => {
			const y = await page.evaluate(() => window.scrollY);
			const still = y === last;
			last = y;
			return still;
		}, { intervals: [150] })
		.toBe(true);
}
