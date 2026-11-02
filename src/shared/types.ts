// Shared data contract between browser and Worker.
// Terms follow CONTEXT.md. Do not change without updating every consumer.

/**
 * A slot is a 30-minute block identified by its start instant, encoded as
 * **whole minutes since the Unix epoch, UTC**: `Date.UTC(2027, 2, 10, 14, 0) / 60_000` for 2027-03-10T14:00Z.
 * Integer minutes cover every real UTC offset (including +5:45) and keep JSON small.
 */
export type SlotId = number;

export const SLOT_MINUTES = 30;

/** IANA time-zone name, e.g. "Europe/Warsaw". */
export type ZoneId = string;

/** Calendar date in the creator zone, "YYYY-MM-DD". */
export type IsoDate = string;

/** Wall-clock time in the creator zone, "HH:MM" on a 30-minute boundary ("00:00".."23:30"). */
export type WallTime = string;

export type EventKind = "dates";

export const MEETING_DURATIONS = [30, 60, 90, 120] as const;
export type MeetingDuration = (typeof MEETING_DURATIONS)[number];

/**
 * The daily window, in the creator zone (ADR 0001).
 * - end > start: same-day window.
 * - end < start: crosses the creator's midnight; slots after midnight belong to the start date.
 * - end === start: full 24 hours.
 */
export interface DailyWindow {
	start: WallTime;
	end: WallTime;
}

/** One grid column: an event date and the slots generated for it (ADR 0003). */
export interface Column {
	date: IsoDate;
	/** Ascending. Length can differ between columns on DST days (ADR 0001). */
	slots: SlotId[];
}

export interface EventDto {
	slug: string;
	title: string;
	kind: EventKind;
	creatorZone: ZoneId;
	/** Ascending, unique, not necessarily consecutive. */
	dates: IsoDate[];
	window: DailyWindow;
	durationMinutes: MeetingDuration;
	/** Generated once from (dates, window, creatorZone) by `generateColumns`. */
	columns: Column[];
	createdAt: string; // ISO 8601 UTC
	expiresAt: string; // ISO 8601 UTC: last slot end + 30 days (ADR 0008)
}

export interface ResponseDto {
	/** Display name, as first typed (ADR 0005). */
	name: string;
	/** Normalised name: the identity within the event. See `normaliseName`. */
	nameKey: string;
	/** Slots marked available. Disjoint from `ifNeeded`. */
	available: SlotId[];
	/** Slots marked "if needed". */
	ifNeeded: SlotId[];
	updatedAt: string; // ISO 8601 UTC
}

/** What GET /api/events/:slug returns. */
export interface EventSnapshot {
	event: EventDto;
	responses: ResponseDto[];
	/** Changes on every write to the event or its responses (ADR 0009). */
	version: number;
}

export type Availability = "available" | "ifNeeded" | "unavailable";

/** A ranked candidate meeting time (ADR 0006). */
export interface BestTime {
	/** First slot of the range. */
	start: SlotId;
	/** Exclusive end, in epoch minutes. */
	end: SlotId;
	/** Names (display) available for the whole range. */
	available: string[];
	/** Names that are at least "if needed" for the whole range, and not fully available. */
	ifNeeded: string[];
	/** Everyone else. */
	missing: string[];
}
