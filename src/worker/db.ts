// D1 access and row ↔ DTO mapping. Schema: migrations/0001_init.sql.
// "Live" means expires_at > now: an expired event that the daily sweep hasn't deleted yet behaves
// exactly like an unknown one (ADR 0008).
import type { EventDto, EventSnapshot, ResponseDto } from "@/shared/types";

export interface EventRow {
	slug: string;
	title: string;
	kind: string;
	creator_zone: string;
	dates: string;
	window_start: string;
	window_end: string;
	duration_minutes: number;
	columns: string;
	admin_hash: string;
	version: number;
	created_at: string;
	expires_at: string;
}

export interface ResponseRow {
	event_slug: string;
	name_key: string;
	name: string;
	available: string;
	if_needed: string;
	updated_at: string;
}

export function toEventDto(row: EventRow): EventDto {
	return {
		slug: row.slug,
		title: row.title,
		kind: "dates",
		creatorZone: row.creator_zone,
		dates: JSON.parse(row.dates),
		window: { start: row.window_start, end: row.window_end },
		durationMinutes: row.duration_minutes as EventDto["durationMinutes"],
		columns: JSON.parse(row.columns),
		createdAt: row.created_at,
		expiresAt: row.expires_at,
	};
}

export function toResponseDto(row: ResponseRow): ResponseDto {
	return {
		name: row.name,
		nameKey: row.name_key,
		available: JSON.parse(row.available),
		ifNeeded: JSON.parse(row.if_needed),
		updatedAt: row.updated_at,
	};
}

/** Cheap poll check: one row, one column (ADR 0009). */
export async function getLiveVersion(db: D1Database, slug: string, now: string): Promise<number | null> {
	return db
		.prepare("SELECT version FROM events WHERE slug = ? AND expires_at > ?")
		.bind(slug, now)
		.first<number>("version");
}

export async function getLiveEvent(db: D1Database, slug: string, now: string): Promise<EventRow | null> {
	return db.prepare("SELECT * FROM events WHERE slug = ? AND expires_at > ?").bind(slug, now).first<EventRow>();
}

export async function listResponses(db: D1Database, slug: string): Promise<ResponseRow[]> {
	const { results } = await db
		.prepare("SELECT * FROM responses WHERE event_slug = ? ORDER BY updated_at, name_key")
		.bind(slug)
		.all<ResponseRow>();
	return results;
}

export async function getSnapshot(db: D1Database, slug: string, now: string): Promise<EventSnapshot | null> {
	// Both reads in one batch so the event, its version and its responses are consistent.
	const [eventRes, responsesRes] = await db.batch<EventRow | ResponseRow>([
		db.prepare("SELECT * FROM events WHERE slug = ? AND expires_at > ?").bind(slug, now),
		db.prepare("SELECT * FROM responses WHERE event_slug = ? ORDER BY updated_at, name_key").bind(slug),
	]);
	const row = eventRes?.results[0] as EventRow | undefined;
	if (!row) return null;
	return {
		event: toEventDto(row),
		responses: ((responsesRes?.results ?? []) as ResponseRow[]).map(toResponseDto),
		version: row.version,
	};
}

/**
 * Slugs held by a live event that start with `prefix`. Callers pass the first 40 characters of a
 * slug, which covers the slug itself and every `<slug>-N` suggestion (trimmed to 48 characters).
 */
export async function liveSlugsWithPrefix(db: D1Database, prefix: string, now: string): Promise<Set<string>> {
	const { results } = await db
		.prepare("SELECT slug FROM events WHERE slug LIKE ? AND expires_at > ?")
		.bind(`${prefix}%`, now)
		.all<{ slug: string }>();
	return new Set(results.map((r) => r.slug));
}

/** Statements that hard-delete one event and its responses (responses first, not relying on FK cascade). */
export function deleteEventStatements(db: D1Database, slug: string): D1PreparedStatement[] {
	return [
		db.prepare("DELETE FROM responses WHERE event_slug = ?").bind(slug),
		db.prepare("DELETE FROM events WHERE slug = ?").bind(slug),
	];
}

/** Statement bumping the version; put it last in a batch and read `version` from its result. */
export function bumpVersionStatement(db: D1Database, slug: string): D1PreparedStatement {
	return db.prepare("UPDATE events SET version = version + 1 WHERE slug = ? RETURNING version").bind(slug);
}

/** ADR 0008: delete every event whose expiry has passed, with its responses. */
export async function sweepExpired(db: D1Database, now: Date): Promise<{ events: number; responses: number }> {
	const cutoff = now.toISOString();
	const [responses, events] = await db.batch([
		db
			.prepare("DELETE FROM responses WHERE event_slug IN (SELECT slug FROM events WHERE expires_at <= ?)")
			.bind(cutoff),
		db.prepare("DELETE FROM events WHERE expires_at <= ?").bind(cutoff),
	]);
	return { events: events?.meta.changes ?? 0, responses: responses?.meta.changes ?? 0 };
}
