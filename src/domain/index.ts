// Pure domain logic, shared by browser and Worker. No DOM, no Cloudflare APIs.
// Signatures are the contract; bodies are implemented in this folder (agent A).

import type {
	BestTime,
	Column,
	DailyWindow,
	IsoDate,
	ResponseDto,
	SlotId,
	ZoneId,
} from "@/shared/types";

export class NotImplemented extends Error {
	constructor(name: string) {
		super(`${name} is not implemented yet`);
	}
}

// ---- Slots (ADR 0001)

/**
 * Generates one column per date. Each column holds the 30-minute slots of the daily window on that
 * date in the creator zone, as UTC epoch minutes. Uses the zone's real offsets: on DST days a column
 * is shorter or longer, and wall times that don't exist (spring-forward gap) produce no slot.
 * A window with end < start runs past midnight into the next day; those slots stay in this column.
 * end === start means 24 hours.
 */
export function generateColumns(_input: {
	dates: IsoDate[];
	window: DailyWindow;
	zone: ZoneId;
}): Column[] {
	throw new NotImplemented("generateColumns");
}

/** All slots of all columns, ascending. */
export function allSlots(_columns: Column[]): SlotId[] {
	throw new NotImplemented("allSlots");
}

/** End instant (exclusive) of the last slot, as epoch minutes. */
export function lastSlotEnd(_columns: Column[]): SlotId {
	throw new NotImplemented("lastSlotEnd");
}

// ---- Display in the viewer zone (ADR 0003)

export interface SlotLabel {
	/** "HH:MM" in the viewer zone, 24-hour. */
	time: string;
	/** Days between the column's viewer-local date and this slot's viewer-local date (0, +1, -1). */
	dayOffset: number;
	/** Viewer-local date of this slot, "YYYY-MM-DD". */
	date: IsoDate;
}

export function labelSlot(_slot: SlotId, _viewerZone: ZoneId, _columnDate: IsoDate): SlotLabel {
	throw new NotImplemented("labelSlot");
}

/** Viewer-local date of a column's first slot (used for column headers). */
export function columnHeaderDate(_column: Column, _viewerZone: ZoneId): IsoDate {
	throw new NotImplemented("columnHeaderDate");
}

/**
 * True when the viewer↔creator offset differs between columns (DST inside the event), so row
 * labels must be shown per column, plus the instant(s) where the shift happens for the notice.
 */
export function offsetShifts(
	_columns: Column[],
	_viewerZone: ZoneId,
	_creatorZone: ZoneId,
): { shifts: boolean; at: SlotId[] } {
	throw new NotImplemented("offsetShifts");
}

/** e.g. "UTC−5", "UTC+5:45". Uses U+2212 for minus. */
export function formatUtcOffset(_zone: ZoneId, _at: SlotId): string {
	throw new NotImplemented("formatUtcOffset");
}

// ---- Names (ADR 0005)

/** Trim, collapse inner whitespace, Unicode NFC, case-fold (toLocaleLowerCase("und")). */
export function normaliseName(_name: string): string {
	throw new NotImplemented("normaliseName");
}

/** Display-name cleanup: trim + collapse whitespace; max 40 chars. Returns null if empty. */
export function cleanDisplayName(_name: string): string | null {
	throw new NotImplemented("cleanDisplayName");
}

// ---- Slugs (ADR 0004)

export const RESERVED_SLUGS: readonly string[] = [
	"api", "new", "admin", "assets", "static", "privacy", "about", "help", "terms",
	"favicon.ico", "robots.txt", "sitemap.xml", "index.html", "_", "health",
];

/** Lowercase a–z, 0–9, single hyphens, no leading/trailing hyphen, length 3–48. */
export function validateSlug(_slug: string): { ok: true } | { ok: false; reason: "format" | "reserved" } {
	throw new NotImplemented("validateSlug");
}

/** Suggest a slug from a title ("Comms weekly sync!" → "comms-weekly-sync"). ASCII-folds accents. */
export function slugify(_title: string): string {
	throw new NotImplemented("slugify");
}

// ---- Results (ADR 0006)

export interface SlotTally {
	available: string[]; // display names
	ifNeeded: string[];
	missing: string[];
}

export function tallySlots(_slots: SlotId[], _responses: ResponseDto[]): Map<SlotId, SlotTally> {
	throw new NotImplemented("tallySlots");
}

/**
 * Heat value 0..1 for a slot: (available + 0.5 × ifNeeded) / respondents. 0 when nobody answered.
 */
export function heat(_tally: SlotTally): number {
	throw new NotImplemented("heat");
}

/**
 * Ranked best times. Considers every run of consecutive slots (no gap between slot end and next
 * start) of at least `durationMinutes`, and returns windows exactly `durationMinutes` long, merged
 * where adjacent windows have identical attendance. Ranking: more available first; then fewer
 * ifNeeded among the rest; then earlier start. Returns at most `limit` (default 5); omits windows
 * nobody can attend.
 */
export function rankBestTimes(
	_columns: Column[],
	_responses: ResponseDto[],
	_durationMinutes: number,
	_limit?: number,
): BestTime[] {
	throw new NotImplemented("rankBestTimes");
}

// ---- Polling merge (ADR 0009)

/**
 * Replace everyone's responses with the server's, except the one being edited locally (by nameKey),
 * whose local draft is kept. If the local draft's nameKey is null, return the server list as is.
 */
export function mergeResponses(
	_server: ResponseDto[],
	_ownNameKey: string | null,
	_ownDraft: ResponseDto | null,
): ResponseDto[] {
	throw new NotImplemented("mergeResponses");
}
