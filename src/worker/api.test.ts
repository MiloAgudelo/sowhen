// Handler tests against a fake D1 built on node:sqlite, running the real migrations.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

// @/domain is agent A's; these stand-ins are enough to drive the handlers. generateColumns here
// ignores the zone (treats it as UTC): the Worker never does zone maths itself.
vi.mock("@/domain", () => {
	const RESERVED = ["api", "new", "admin", "assets", "static", "privacy", "about", "help", "terms", "health", "_"];
	const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
	return {
		generateColumns: ({ dates, window }: { dates: string[]; window: { start: string; end: string } }) =>
			dates.map((date) => {
				const day = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 60_000;
				const start = toMin(window.start);
				let end = toMin(window.end);
				if (end <= start) end += 24 * 60;
				const slots: number[] = [];
				for (let m = start; m < end; m += 30) slots.push(day + m);
				return { date, slots };
			}),
		lastSlotEnd: (columns: { slots: number[] }[]) => Math.max(...columns.flatMap((c) => c.slots)) + 30,
		normaliseName: (s: string) => s.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase("und"),
		cleanDisplayName: (s: string) => {
			const t = s.trim().replace(/\s+/g, " ").slice(0, 40);
			return t ? t : null;
		},
		validateSlug: (s: string) =>
			!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) || s.length < 3 || s.length > 48
				? { ok: false, reason: "format" }
				: RESERVED.includes(s)
					? { ok: false, reason: "reserved" }
					: { ok: true },
		slugify: (s: string) =>
			s
				.normalize("NFKD")
				.replace(/[̀-ͯ]/g, "")
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "")
				.slice(0, 48),
	};
});

import { handleApi, nextFreeSlug } from "./api";
import { sweepExpired } from "./db";

// ---- Fake D1 (only what the Worker uses)

class FakeStatement {
	constructor(
		private readonly db: DatabaseSync,
		private readonly sql: string,
		private readonly params: SQLInputValue[] = [],
	) {}
	bind(...params: SQLInputValue[]) {
		return new FakeStatement(this.db, this.sql, params);
	}
	private rows() {
		return this.db
			.prepare(this.sql)
			.all(...this.params)
			.map((r) => ({ ...r }));
	}
	async first(col?: string) {
		const row = this.rows()[0];
		if (!row) return null;
		return col ? (row as Record<string, unknown>)[col] : row;
	}
	async all() {
		return this.exec();
	}
	async run() {
		return this.exec();
	}
	exec() {
		const stmt = this.db.prepare(this.sql);
		if (stmt.columns().length > 0) {
			const results = stmt.all(...this.params).map((r) => ({ ...r }));
			const changes = Number((this.db.prepare("SELECT changes() AS c").get() as { c: number }).c);
			return { results, success: true, meta: { changes } };
		}
		const info = stmt.run(...this.params);
		return { results: [], success: true, meta: { changes: Number(info.changes) } };
	}
}

function fakeD1() {
	const db = new DatabaseSync(":memory:");
	db.exec("PRAGMA foreign_keys = ON");
	const dir = fileURLToPath(new URL("../../migrations/", import.meta.url));
	for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
		db.exec(readFileSync(dir + file, "utf8"));
	}
	const d1 = {
		prepare: (sql: string) => new FakeStatement(db, sql),
		async batch(stmts: FakeStatement[]) {
			db.exec("BEGIN");
			try {
				const out = stmts.map((s) => s.exec());
				db.exec("COMMIT");
				return out;
			} catch (err) {
				db.exec("ROLLBACK");
				throw err;
			}
		},
	};
	return { raw: db, d1: d1 as unknown as D1Database };
}

// ---- Helpers

const NOW = new Date("2027-03-01T12:00:00Z");
let raw: DatabaseSync;
let db: D1Database;

beforeEach(() => {
	({ raw, d1: db } = fakeD1());
});

async function call(method: string, path: string, opts: { body?: unknown; admin?: string; now?: Date } = {}) {
	const headers: Record<string, string> = {};
	if (opts.body !== undefined) headers["Content-Type"] = "application/json";
	if (opts.admin !== undefined) headers["X-Sowhen-Admin"] = opts.admin;
	const res = await handleApi(
		new Request(`http://localhost${path}`, {
			method,
			headers,
			body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
		}),
		db,
		opts.now ?? NOW,
	);
	expect(res.headers.get("Cache-Control")).toBe("no-store");
	const text = await res.text();
	return { status: res.status, body: text ? JSON.parse(text) : null };
}

const input = (over: Record<string, unknown> = {}) => ({
	slug: "comms-weekly",
	title: "Comms weekly",
	creatorZone: "Europe/Warsaw",
	dates: ["2027-03-10", "2027-03-11"],
	window: { start: "09:00", end: "11:00" },
	durationMinutes: 60,
	...over,
});

const day10 = Date.UTC(2027, 2, 10) / 60_000;
const day11 = Date.UTC(2027, 2, 11) / 60_000;
const at = (day: number, h: number, m = 0) => day + h * 60 + m;

async function create(over: Record<string, unknown> = {}) {
	const res = await call("POST", "/api/events", { body: input(over) });
	expect(res.status).toBe(201);
	return res.body as { event: { slug: string; expiresAt: string }; adminSecret: string };
}

// ---- Tests

describe("create and slugs", () => {
	it("creates an event with columns, expiry and a one-time admin secret", async () => {
		const { event, adminSecret } = await create();
		expect(adminSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(event).toMatchObject({
			slug: "comms-weekly",
			kind: "dates",
			dates: ["2027-03-10", "2027-03-11"],
			columns: [
				{ date: "2027-03-10", slots: [at(day10, 9), at(day10, 9, 30), at(day10, 10), at(day10, 10, 30)] },
				{ date: "2027-03-11", slots: [at(day11, 9), at(day11, 9, 30), at(day11, 10), at(day11, 10, 30)] },
			],
			createdAt: NOW.toISOString(),
			expiresAt: "2027-04-10T11:00:00.000Z", // last slot end + 30 days
		});
		const stored = raw.prepare("SELECT admin_hash FROM events").get() as { admin_hash: string };
		expect(stored.admin_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(stored.admin_hash).not.toContain(adminSecret);
	});

	it("409 on a clash; slug check suggests -2, then -3", async () => {
		await create();
		const clash = await call("POST", "/api/events", { body: input() });
		expect(clash.status).toBe(409);
		expect(clash.body.error).toBe("slug_taken");
		expect(clash.body.message).toContain("comms-weekly-2");

		expect((await call("GET", "/api/slugs/comms-weekly")).body).toEqual({
			slug: "comms-weekly",
			available: false,
			suggestion: "comms-weekly-2",
		});
		await create({ slug: "comms-weekly-2" });
		expect((await call("GET", "/api/slugs/comms-weekly")).body.suggestion).toBe("comms-weekly-3");
		expect((await call("GET", "/api/slugs/team-sync")).body).toEqual({ slug: "team-sync", available: true });
	});

	it("slug check reports invalid and reserved slugs with a suggestion", async () => {
		expect((await call("GET", "/api/slugs/Comms%20Weekly!")).body).toEqual({
			slug: "Comms Weekly!",
			available: false,
			reason: "format",
			suggestion: "comms-weekly",
		});
		expect((await call("GET", "/api/slugs/admin")).body).toEqual({
			slug: "admin",
			available: false,
			reason: "reserved",
			suggestion: "admin-2",
		});
	});

	it("long slugs (> 40 chars) are seen as taken and get a free suggestion", async () => {
		const long = "abcdefghij".repeat(4) + "abcde"; // 45 chars
		await create({ slug: long });
		const check = (await call("GET", `/api/slugs/${long}`)).body;
		expect(check.available).toBe(false);
		expect(check.suggestion).toBe(`${long}-2`);
		await create({ slug: check.suggestion });
		const next = (await call("GET", `/api/slugs/${long}`)).body.suggestion;
		expect(next).toBe(`${long}-3`);
		expect(next.length).toBeLessThanOrEqual(48);
		expect((await call("POST", "/api/events", { body: input({ slug: next }) })).status).toBe(201);
	});

	it("suggestions stay within 48 characters", () => {
		const base = "a".repeat(48);
		expect(nextFreeSlug(base, new Set())).toBe(`${"a".repeat(46)}-2`);
	});

	it("rejects invalid input", async () => {
		for (const [over, code] of [
			[{ slug: "Bad Slug" }, "slug_invalid"],
			[{ slug: "api" }, "slug_invalid"],
			[{ title: "" }, "bad_request"],
			[{ creatorZone: "Mars/Olympus" }, "bad_request"],
			[{ dates: [] }, "bad_request"],
			[{ dates: ["2027-02-30"] }, "bad_request"],
			[{ window: { start: "09:10", end: "10:00" } }, "bad_request"],
			[{ durationMinutes: 45 }, "bad_request"],
			[{ dates: ["2026-01-01"] }, "bad_request"], // already expired
		] as const) {
			const res = await call("POST", "/api/events", { body: input(over) });
			expect([res.status, res.body.error], JSON.stringify(over)).toEqual([400, code]);
		}
		expect((await call("POST", "/api/events", { body: "{nope" })).status).toBe(400);
		expect((await call("POST", "/api/events", { body: "[]" })).status).toBe(400);
	});
});

describe("event snapshot and polling", () => {
	it("returns 200, then 304 for the current version, 404 for unknown", async () => {
		await create();
		const res = await call("GET", "/api/events/comms-weekly");
		expect(res.status).toBe(200);
		expect(res.body.version).toBe(1);
		expect(res.body.responses).toEqual([]);
		expect(res.body.event).not.toHaveProperty("adminHash");

		const same = await call("GET", "/api/events/comms-weekly?v=1");
		expect([same.status, same.body]).toEqual([304, null]);
		expect((await call("GET", "/api/events/comms-weekly?v=0")).status).toBe(200);
		expect((await call("GET", "/api/events/nope-nope")).status).toBe(404);
		expect((await call("GET", "/api/events/nope-nope?v=1")).status).toBe(404);
	});
});

describe("responses", () => {
	it("upserts by normalised name, keeps the first-typed name, bumps the version", async () => {
		await create();
		const first = await call("PUT", "/api/events/comms-weekly/responses", {
			body: { name: " Anna  K ", available: [at(day10, 9), at(day10, 9, 30)], ifNeeded: [at(day11, 10)] },
		});
		expect(first.status).toBe(200);
		expect(first.body.version).toBe(2);
		expect(first.body.response).toMatchObject({ name: "Anna K", nameKey: "anna k" });

		const again = await call("PUT", "/api/events/comms-weekly/responses", {
			body: { name: "ANNA k", available: [at(day10, 10)], ifNeeded: [] },
		});
		expect(again.body.version).toBe(3);
		expect(again.body.response).toMatchObject({ name: "Anna K", nameKey: "anna k", available: [at(day10, 10)] });

		const snap = await call("GET", "/api/events/comms-weekly");
		expect(snap.body.responses).toHaveLength(1);
		expect((await call("GET", "/api/events/comms-weekly?v=3")).status).toBe(304);
	});

	it("rejects foreign or overlapping slots, and unknown events", async () => {
		await create();
		const path = "/api/events/comms-weekly/responses";
		expect((await call("PUT", path, { body: { name: "A", available: [at(day10, 12)], ifNeeded: [] } })).status).toBe(400);
		expect(
			(await call("PUT", path, { body: { name: "A", available: [at(day10, 9)], ifNeeded: [at(day10, 9)] } })).status,
		).toBe(400);
		expect((await call("PUT", path, { body: { name: "  ", available: [] } })).status).toBe(400);
		expect((await call("PUT", "/api/events/other-one/responses", { body: { name: "A" } })).status).toBe(404);
	});

	it("deletes by name key (any case), bumping the version; 404 when absent", async () => {
		await create();
		await call("PUT", "/api/events/comms-weekly/responses", { body: { name: "Kenji", available: [at(day10, 9)] } });
		const del = await call("DELETE", "/api/events/comms-weekly/responses/KENJI");
		expect(del.status).toBe(204);
		const snap = await call("GET", "/api/events/comms-weekly");
		expect(snap.body.responses).toEqual([]);
		expect(snap.body.version).toBe(3);
		expect((await call("DELETE", "/api/events/comms-weekly/responses/kenji")).status).toBe(404);
		expect((await call("GET", "/api/events/comms-weekly")).body.version).toBe(3);
		expect((await call("DELETE", "/api/events/comms-weekly/responses/%E0%A4%A")).status).toBe(400);
	});
});

describe("admin", () => {
	it("checks the secret: 204 / 403 / 404", async () => {
		const { adminSecret } = await create();
		expect((await call("GET", "/api/events/comms-weekly/admin", { admin: adminSecret })).status).toBe(204);
		expect((await call("GET", "/api/events/comms-weekly/admin", { admin: "wrong" })).body.error).toBe("forbidden");
		expect((await call("GET", "/api/events/comms-weekly/admin")).status).toBe(403);
		expect((await call("GET", "/api/events/missing-one/admin", { admin: adminSecret })).status).toBe(404);
	});

	it("PATCH regenerates columns, strips lost slots and reports responsesAffected", async () => {
		const { adminSecret } = await create();
		const path = "/api/events/comms-weekly/responses";
		await call("PUT", path, { body: { name: "Anna", available: [at(day10, 9), at(day11, 9)] } });
		await call("PUT", path, { body: { name: "Kenji", ifNeeded: [at(day10, 10)] } });
		await call("PUT", path, { body: { name: "Ola", available: [at(day11, 10, 30)] } });

		expect((await call("PATCH", "/api/events/comms-weekly", { body: { title: "x" } })).status).toBe(403);
		expect((await call("PATCH", "/api/events/comms-weekly", { body: {}, admin: adminSecret })).status).toBe(400);

		// Drop March 10 and shrink the window to 10:00–12:00.
		const res = await call("PATCH", "/api/events/comms-weekly", {
			admin: adminSecret,
			body: { dates: ["2027-03-11", "2027-03-12"], window: { start: "10:00", end: "12:00" }, title: "Comms v2" },
		});
		expect(res.status).toBe(200);
		expect(res.body.responsesAffected).toBe(2); // Anna and Kenji; Ola's 10:30 survives
		const { event, responses, version } = res.body.snapshot;
		expect(event.title).toBe("Comms v2");
		expect(event.columns.map((c: { date: string }) => c.date)).toEqual(["2027-03-11", "2027-03-12"]);
		expect(event.expiresAt).toBe("2027-04-11T12:00:00.000Z");
		expect(version).toBe(5);
		const byName = Object.fromEntries(responses.map((r: { name: string }) => [r.name, r]));
		expect(byName.Anna).toMatchObject({ available: [], ifNeeded: [] });
		expect(byName.Kenji).toMatchObject({ available: [], ifNeeded: [] });
		expect(byName.Ola).toMatchObject({ available: [at(day11, 10, 30)] });

		// Title-only change: no regeneration, nobody affected.
		const titleOnly = await call("PATCH", "/api/events/comms-weekly", { admin: adminSecret, body: { durationMinutes: 120 } });
		expect(titleOnly.body.responsesAffected).toBe(0);
		expect(titleOnly.body.snapshot.event.durationMinutes).toBe(120);
	});

	it("DELETE removes the event and its responses", async () => {
		const { adminSecret } = await create();
		await call("PUT", "/api/events/comms-weekly/responses", { body: { name: "Anna", available: [at(day10, 9)] } });
		expect((await call("DELETE", "/api/events/comms-weekly", { admin: "nope" })).status).toBe(403);
		expect((await call("DELETE", "/api/events/comms-weekly", { admin: adminSecret })).status).toBe(204);
		expect((await call("GET", "/api/events/comms-weekly")).status).toBe(404);
		expect(raw.prepare("SELECT COUNT(*) AS n FROM responses").get()).toEqual({ n: 0 });
		expect((await call("GET", "/api/slugs/comms-weekly")).body.available).toBe(true);
	});
});

describe("expiry (ADR 0008)", () => {
	it("expired events 404 before the sweep, free their slug, and the sweep deletes them", async () => {
		await create();
		await create({ slug: "later-one", dates: ["2027-06-01"] });
		await call("PUT", "/api/events/comms-weekly/responses", { body: { name: "Anna", available: [at(day10, 9)] } });

		const after = new Date("2027-04-10T11:00:00.000Z"); // exactly expiresAt
		expect((await call("GET", "/api/events/comms-weekly", { now: after })).status).toBe(404);
		expect((await call("GET", "/api/events/comms-weekly?v=1", { now: after })).status).toBe(404);
		expect((await call("GET", "/api/slugs/comms-weekly", { now: after })).body.available).toBe(true);

		expect(await sweepExpired(db, after)).toEqual({ events: 1, responses: 1 });
		expect(raw.prepare("SELECT slug FROM events").all().map((r) => r.slug)).toEqual(["later-one"]);
	});

	it("create reclaims an expired-but-unswept slug", async () => {
		await create();
		const after = new Date("2027-05-01T00:00:00Z");
		const res = await call("POST", "/api/events", { body: input({ dates: ["2027-05-10"] }), now: after });
		expect(res.status).toBe(201);
	});
});

describe("routing", () => {
	it("unknown routes and methods are 404 not_found", async () => {
		expect((await call("GET", "/api/nope")).body.error).toBe("not_found");
		expect((await call("POST", "/api/events/comms-weekly")).status).toBe(404);
		expect((await call("GET", "/api/health")).body).toEqual({ ok: true });
	});
});
