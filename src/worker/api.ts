// The JSON API, exactly as specified in src/shared/api.ts. No framework: a small segment router.
// Kept free of `cloudflare:workers` so it can be unit-tested in Node with a fake D1.
import "temporal-polyfill/global"; // domain reads globalThis.Temporal (src/domain/temporal.ts); no-op where native
import { generateColumns, lastSlotEnd, normaliseName, slugify, validateSlug } from "@/domain";
import {
	ADMIN_HEADER,
	VERSION_PARAM,
	type CreateEventResult,
	type PatchEventResult,
	type PutResponseResult,
	type SlugCheck,
} from "@/shared/api";
import type { Column, DailyWindow, EventDto, IsoDate, ZoneId } from "@/shared/types";
import { verifySecret, generateSecret, sha256Hex } from "./auth";
import {
	bumpVersionStatement,
	deleteEventStatements,
	getLiveEvent,
	getLiveVersion,
	getSnapshot,
	liveSlugsWithPrefix,
	toEventDto,
	toResponseDto,
	type EventRow,
	type ResponseRow,
} from "./db";
import { apiError, badRequest, HttpError, json, noContent, notFound, notModified, readJsonObject } from "./http";
import {
	checkSlotsBelong,
	parseCreateInput,
	parsePatchInput,
	parsePutResponseInput,
	slotSet,
} from "./validate";

/** ADR 0008: events live until 30 days after their last slot ends. */
export const RETENTION_MINUTES = 30 * 24 * 60;

type Ctx = { request: Request; db: D1Database; now: Date; nowIso: string; url: URL };

export async function handleApi(request: Request, db: D1Database, now = new Date()): Promise<Response> {
	const url = new URL(request.url);
	const ctx: Ctx = { request, db, now, nowIso: now.toISOString(), url };
	try {
		return await route(ctx);
	} catch (err) {
		if (err instanceof HttpError) return apiError(err.code, err.message);
		console.error("sowhen api error", err);
		// The contract has no 5xx code; this is the one response outside ApiErrorCode.
		return json({ error: "internal", message: "Something went wrong. Please try again." }, 500);
	}
}

async function route(ctx: Ctx): Promise<Response> {
	const parts = ctx.url.pathname.split("/").slice(2); // drop "" and "api"
	if (parts.at(-1) === "") parts.pop(); // tolerate a trailing slash
	let seg: string[];
	try {
		seg = parts.map(decodeURIComponent);
	} catch {
		throw badRequest("Malformed URL encoding.");
	}
	const method = ctx.request.method;
	const [a, slug, c, d, ...rest] = seg;

	if (rest.length === 0) {
		if (a === "health" && slug === undefined && method === "GET") return json({ ok: true });
		if (a === "slugs" && slug !== undefined && c === undefined && method === "GET") return checkSlug(ctx, slug);
		if (a === "events") {
			if (slug === undefined) {
				if (method === "POST") return createEvent(ctx);
			} else if (c === undefined) {
				if (method === "GET") return getEvent(ctx, slug);
				if (method === "PATCH") return patchEvent(ctx, slug);
				if (method === "DELETE") return deleteEvent(ctx, slug);
			} else if (c === "admin" && d === undefined) {
				if (method === "GET") return checkAdmin(ctx, slug);
			} else if (c === "responses") {
				if (d === undefined && method === "PUT") return putResponse(ctx, slug);
				if (d !== undefined && method === "DELETE") return deleteResponse(ctx, slug, d);
			}
		}
	}
	return apiError("not_found", "No such API route.");
}

// ---- Slugs (ADR 0004)

const MAX_SLUG = 48;

/** First free `<base>-N` (N ≥ 2) that is a valid slug, trimming the base to stay within the length limit. */
export function nextFreeSlug(base: string, taken: Set<string>): string | undefined {
	for (let n = 2; n < 1000; n++) {
		const suffix = `-${n}`;
		const candidate = base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, "") + suffix;
		if (validateSlug(candidate).ok && !taken.has(candidate)) return candidate;
	}
	return undefined;
}

async function suggestFrom(ctx: Ctx, base: string): Promise<string | undefined> {
	const taken = await liveSlugsWithPrefix(ctx.db, base.slice(0, 40), ctx.nowIso);
	if (validateSlug(base).ok && !taken.has(base)) return base;
	return nextFreeSlug(base, taken);
}

async function checkSlug(ctx: Ctx, slug: string): Promise<Response> {
	const check = validateSlug(slug);
	if (!check.ok) {
		const base = check.reason === "format" ? slugify(slug) : slug;
		const suggestion = base ? await suggestFrom(ctx, base) : undefined;
		const body: SlugCheck = { slug, available: false, reason: check.reason };
		if (suggestion) body.suggestion = suggestion;
		return json(body);
	}
	const taken = await liveSlugsWithPrefix(ctx.db, slug.slice(0, 40), ctx.nowIso);
	if (!taken.has(slug)) return json({ slug, available: true } satisfies SlugCheck);
	const body: SlugCheck = { slug, available: false };
	const suggestion = nextFreeSlug(slug, taken);
	if (suggestion) body.suggestion = suggestion;
	return json(body);
}

// ---- Events

/** Columns for (dates, window, zone), plus the expiry they imply. Rejects empty or already-expired grids. */
function buildGrid(
	ctx: Ctx,
	input: { dates: IsoDate[]; window: DailyWindow; zone: ZoneId },
): { columns: Column[]; expiresAt: string } {
	const columns = generateColumns(input);
	if (slotSet(columns).size === 0) throw badRequest("The dates and window produce no time slots.");
	const expiresMs = (lastSlotEnd(columns) + RETENTION_MINUTES) * 60_000;
	if (expiresMs <= ctx.now.getTime()) throw badRequest("These dates are too far in the past.");
	return { columns, expiresAt: new Date(expiresMs).toISOString() };
}

function isUniqueViolation(err: unknown): boolean {
	return err instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(err.message);
}

async function createEvent(ctx: Ctx): Promise<Response> {
	const input = parseCreateInput(await readJsonObject(ctx.request));
	const slugCheck = validateSlug(input.slug);
	if (!slugCheck.ok) {
		throw new HttpError(
			"slug_invalid",
			slugCheck.reason === "reserved"
				? "That link is reserved. Pick another."
				: "Links use lowercase letters, digits and single hyphens (3–48 characters).",
		);
	}
	const { columns, expiresAt } = buildGrid(ctx, {
		dates: input.dates,
		window: input.window,
		zone: input.creatorZone,
	});
	const adminSecret = generateSecret();
	const event: EventDto = {
		slug: input.slug,
		title: input.title,
		kind: "dates",
		creatorZone: input.creatorZone,
		dates: input.dates,
		window: input.window,
		durationMinutes: input.durationMinutes,
		columns,
		createdAt: ctx.nowIso,
		expiresAt,
	};
	const db = ctx.db;
	try {
		await db.batch([
			// An expired event that the sweep hasn't reached yet no longer holds its slug.
			db
				.prepare(
					"DELETE FROM responses WHERE event_slug = ? AND EXISTS (SELECT 1 FROM events WHERE slug = ? AND expires_at <= ?)",
				)
				.bind(event.slug, event.slug, ctx.nowIso),
			db.prepare("DELETE FROM events WHERE slug = ? AND expires_at <= ?").bind(event.slug, ctx.nowIso),
			db
				.prepare(
					`INSERT INTO events (slug, title, kind, creator_zone, dates, window_start, window_end,
					 duration_minutes, columns, admin_hash, version, created_at, expires_at)
					 VALUES (?, ?, 'dates', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
				)
				.bind(
					event.slug,
					event.title,
					event.creatorZone,
					JSON.stringify(event.dates),
					event.window.start,
					event.window.end,
					event.durationMinutes,
					JSON.stringify(columns),
					await sha256Hex(adminSecret),
					event.createdAt,
					event.expiresAt,
				),
		]);
	} catch (err) {
		if (!isUniqueViolation(err)) throw err;
		const taken = await liveSlugsWithPrefix(db, event.slug.slice(0, 40), ctx.nowIso);
		const suggestion = nextFreeSlug(event.slug, taken);
		throw new HttpError(
			"slug_taken",
			suggestion ? `That link is taken. How about "${suggestion}"?` : "That link is taken.",
		);
	}
	return json({ event, adminSecret } satisfies CreateEventResult, 201);
}

/** Slugs in paths that can't be valid never reach D1. */
function liveSlugOrThrow(slug: string): string {
	if (!validateSlug(slug).ok) throw notFound();
	return slug;
}

async function getEvent(ctx: Ctx, rawSlug: string): Promise<Response> {
	const slug = liveSlugOrThrow(rawSlug);
	const known = ctx.url.searchParams.get(VERSION_PARAM);
	if (known !== null && /^\d+$/.test(known)) {
		const version = await getLiveVersion(ctx.db, slug, ctx.nowIso);
		if (version === null) throw notFound();
		if (version === Number(known)) return notModified();
	}
	const snapshot = await getSnapshot(ctx.db, slug, ctx.nowIso);
	if (!snapshot) throw notFound();
	return json(snapshot);
}

/** Loads a live event and checks the admin header: 404 before 403. */
async function requireAdmin(ctx: Ctx, rawSlug: string): Promise<EventRow> {
	const row = await getLiveEvent(ctx.db, liveSlugOrThrow(rawSlug), ctx.nowIso);
	if (!row) throw notFound();
	if (!(await verifySecret(ctx.request.headers.get(ADMIN_HEADER), row.admin_hash))) {
		throw new HttpError("forbidden", "This admin link isn't valid for this event.");
	}
	return row;
}

async function checkAdmin(ctx: Ctx, slug: string): Promise<Response> {
	await requireAdmin(ctx, slug);
	return noContent();
}

async function patchEvent(ctx: Ctx, slug: string): Promise<Response> {
	const row = await requireAdmin(ctx, slug);
	const patch = parsePatchInput(await readJsonObject(ctx.request));
	const old = toEventDto(row);
	const dates = patch.dates ?? old.dates;
	const window = patch.window ?? old.window;
	const gridChanged =
		JSON.stringify(dates) !== JSON.stringify(old.dates) ||
		window.start !== old.window.start ||
		window.end !== old.window.end;

	const db = ctx.db;
	const statements: D1PreparedStatement[] = [];
	let columns = old.columns;
	let expiresAt = old.expiresAt;
	let responsesAffected = 0;

	if (gridChanged) {
		({ columns, expiresAt } = buildGrid(ctx, { dates, window, zone: old.creatorZone }));
		const valid = slotSet(columns);
		const { results } = await db
			.prepare("SELECT * FROM responses WHERE event_slug = ?")
			.bind(row.slug)
			.all<ResponseRow>();
		for (const r of results) {
			const dto = toResponseDto(r);
			const available = dto.available.filter((s) => valid.has(s));
			const ifNeeded = dto.ifNeeded.filter((s) => valid.has(s));
			if (available.length === dto.available.length && ifNeeded.length === dto.ifNeeded.length) continue;
			responsesAffected++;
			statements.push(
				db
					.prepare("UPDATE responses SET available = ?, if_needed = ? WHERE event_slug = ? AND name_key = ?")
					.bind(JSON.stringify(available), JSON.stringify(ifNeeded), row.slug, r.name_key),
			);
		}
	}

	statements.unshift(
		db
			.prepare(
				`UPDATE events SET title = ?, dates = ?, window_start = ?, window_end = ?, duration_minutes = ?,
				 columns = ?, expires_at = ? WHERE slug = ?`,
			)
			.bind(
				patch.title ?? old.title,
				JSON.stringify(dates),
				window.start,
				window.end,
				patch.durationMinutes ?? old.durationMinutes,
				JSON.stringify(columns),
				expiresAt,
				row.slug,
			),
	);
	statements.push(bumpVersionStatement(db, row.slug));
	await db.batch(statements);

	const snapshot = await getSnapshot(db, row.slug, ctx.nowIso);
	if (!snapshot) throw notFound();
	return json({ snapshot, responsesAffected } satisfies PatchEventResult);
}

async function deleteEvent(ctx: Ctx, slug: string): Promise<Response> {
	const row = await requireAdmin(ctx, slug);
	await ctx.db.batch(deleteEventStatements(ctx.db, row.slug));
	return noContent();
}

// ---- Responses (ADR 0005)

async function putResponse(ctx: Ctx, rawSlug: string): Promise<Response> {
	const slug = liveSlugOrThrow(rawSlug);
	const input = parsePutResponseInput(await readJsonObject(ctx.request));
	const row = await getLiveEvent(ctx.db, slug, ctx.nowIso);
	if (!row) throw notFound();
	checkSlotsBelong(input, JSON.parse(row.columns) as Column[]);
	const nameKey = normaliseName(input.name);
	if (!nameKey) throw badRequest("Name is required.");

	const db = ctx.db;
	let results: D1Result[];
	try {
		results = await db.batch([
			// The display name stays as first typed (ADR 0005); only the slots are overwritten.
			db
				.prepare(
					`INSERT INTO responses (event_slug, name_key, name, available, if_needed, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?)
					 ON CONFLICT (event_slug, name_key) DO UPDATE SET
					   available = excluded.available, if_needed = excluded.if_needed, updated_at = excluded.updated_at
					 RETURNING *`,
				)
				.bind(
					slug,
					nameKey,
					input.name,
					JSON.stringify(input.available),
					JSON.stringify(input.ifNeeded),
					ctx.nowIso,
				),
			bumpVersionStatement(db, slug),
		]);
	} catch (err) {
		// The event was deleted between the read and the write (foreign key).
		if (err instanceof Error && /FOREIGN KEY/i.test(err.message)) throw notFound();
		throw err;
	}
	const saved = results[0]?.results[0] as ResponseRow | undefined;
	const version = (results[1]?.results[0] as { version: number } | undefined)?.version;
	if (!saved || version === undefined) throw notFound();
	return json({ response: toResponseDto(saved), version } satisfies PutResponseResult);
}

async function deleteResponse(ctx: Ctx, rawSlug: string, rawKey: string): Promise<Response> {
	const slug = liveSlugOrThrow(rawSlug);
	const row = await getLiveEvent(ctx.db, slug, ctx.nowIso);
	if (!row) throw notFound();
	const nameKey = normaliseName(rawKey);
	const db = ctx.db;
	const [deleted] = await db.batch([
		db.prepare("DELETE FROM responses WHERE event_slug = ? AND name_key = ? RETURNING name_key").bind(slug, nameKey),
		// changes() is the previous statement's row count: bump only if something was deleted.
		db.prepare("UPDATE events SET version = version + 1 WHERE slug = ? AND changes() > 0").bind(slug),
	]);
	if (!deleted?.results.length) throw new HttpError("not_found", "No response with that name.");
	return noContent();
}
