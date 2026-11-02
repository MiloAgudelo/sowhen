// Server-side input validation (ADR 0004: never trust the form). Pure: no D1, no Workers APIs.
// Each parser returns a clean value or throws HttpError("bad_request").
import { cleanDisplayName } from "@/domain";
import { canonicalZone } from "@/domain/zones";
import type { CreateEventInput, PatchEventInput, PutResponseInput } from "@/shared/api";
import {
	MEETING_DURATIONS,
	type Column,
	type DailyWindow,
	type IsoDate,
	type MeetingDuration,
	type SlotId,
	type ZoneId,
} from "@/shared/types";
import { badRequest } from "./http";

export const MAX_TITLE_LENGTH = 100;
export const MAX_DATES = 31;
/** Raw name length accepted before cleanup; cleanDisplayName caps the stored name at 40. */
const MAX_RAW_NAME_LENGTH = 200;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_TIME = /^([01]\d|2[0-3]):(00|30)$/;

export function parseTitle(value: unknown): string {
	if (typeof value !== "string") throw badRequest("Title is required.");
	const title = value.trim().replace(/\s+/g, " ");
	if (title.length === 0) throw badRequest("Title is required.");
	if (title.length > MAX_TITLE_LENGTH) {
		throw badRequest(`Title must be at most ${MAX_TITLE_LENGTH} characters.`);
	}
	return title;
}

/** A real IANA zone name. Rejects offset strings ("+05:00") that newer engines also accept. */
export function isValidZone(value: unknown): value is ZoneId {
	if (typeof value !== "string" || value.length > 64 || !/^[A-Za-z]/.test(value)) return false;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

export function parseZone(value: unknown): ZoneId {
	if (!isValidZone(value)) throw badRequest("Time zone must be a valid IANA zone, e.g. Europe/Warsaw.");
	return value;
}

/** "YYYY-MM-DD" that exists on the calendar, years 2000–2099. */
export function isIsoDate(value: unknown): value is IsoDate {
	if (typeof value !== "string") return false;
	const m = ISO_DATE.exec(value);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	if (y < 2000 || y > 2099) return false;
	const date = new Date(Date.UTC(y, mo - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** 1–31 valid dates; duplicates removed; returned ascending. */
export function parseDates(value: unknown): IsoDate[] {
	if (!Array.isArray(value) || value.length === 0) throw badRequest("Pick at least one date.");
	if (value.length > MAX_DATES) throw badRequest(`An event can have at most ${MAX_DATES} dates.`);
	for (const d of value) {
		if (!isIsoDate(d)) throw badRequest(`Invalid date: ${JSON.stringify(d)}. Use YYYY-MM-DD.`);
	}
	return [...new Set(value as IsoDate[])].sort();
}

export function parseWindow(value: unknown): DailyWindow {
	if (typeof value !== "object" || value === null) throw badRequest("Daily window is required.");
	const { start, end } = value as Record<string, unknown>;
	if (typeof start !== "string" || !WALL_TIME.test(start) || typeof end !== "string" || !WALL_TIME.test(end)) {
		throw badRequest("Window start and end must be HH:MM on a 30-minute boundary.");
	}
	return { start, end };
}

export function parseDuration(value: unknown): MeetingDuration {
	if (!(MEETING_DURATIONS as readonly unknown[]).includes(value)) {
		throw badRequest(`Meeting duration must be one of ${MEETING_DURATIONS.join(", ")} minutes.`);
	}
	return value as MeetingDuration;
}

/** Validates everything except the slug (checked separately so it can report slug_invalid). */
export function parseCreateInput(body: Record<string, unknown>): CreateEventInput {
	if (typeof body.slug !== "string") throw badRequest("Slug is required.");
	return {
		slug: body.slug,
		title: parseTitle(body.title),
		// ADR 0016: store the current name whatever the browser reported ("Asia/Katmandu" → "Asia/Kathmandu").
		creatorZone: canonicalZone(parseZone(body.creatorZone)),
		dates: parseDates(body.dates),
		window: parseWindow(body.window),
		durationMinutes: parseDuration(body.durationMinutes ?? 60),
	};
}

export function parsePatchInput(body: Record<string, unknown>): PatchEventInput {
	const patch: PatchEventInput = {};
	if (body.title !== undefined) patch.title = parseTitle(body.title);
	if (body.dates !== undefined) patch.dates = parseDates(body.dates);
	if (body.window !== undefined) patch.window = parseWindow(body.window);
	if (body.durationMinutes !== undefined) patch.durationMinutes = parseDuration(body.durationMinutes);
	if (Object.keys(patch).length === 0) {
		throw badRequest("Nothing to change: send title, dates, window or durationMinutes.");
	}
	return patch;
}

/** Cleans the display name; returns it with raw slot arrays (checked against the event later). */
export function parsePutResponseInput(body: Record<string, unknown>): PutResponseInput {
	if (typeof body.name !== "string" || body.name.length > MAX_RAW_NAME_LENGTH) {
		throw badRequest("Name is required.");
	}
	const name = cleanDisplayName(body.name);
	if (name === null) throw badRequest("Name is required.");
	return {
		name,
		available: parseSlotArray(body.available ?? [], "available"),
		ifNeeded: parseSlotArray(body.ifNeeded ?? [], "ifNeeded"),
	};
}

function parseSlotArray(value: unknown, field: string): SlotId[] {
	if (!Array.isArray(value)) throw badRequest(`${field} must be an array of slot ids.`);
	if (value.length > 31 * 48 + 8) throw badRequest(`${field} has too many slots.`);
	for (const s of value) {
		if (!Number.isSafeInteger(s)) throw badRequest(`${field} must contain integer slot ids.`);
	}
	return [...new Set(value as SlotId[])].sort((a, b) => a - b);
}

/** Every slot must belong to the event; available and ifNeeded must not overlap. */
export function checkSlotsBelong(input: { available: SlotId[]; ifNeeded: SlotId[] }, columns: Column[]): void {
	const valid = slotSet(columns);
	for (const s of [...input.available, ...input.ifNeeded]) {
		if (!valid.has(s)) throw badRequest(`Slot ${s} is not part of this event.`);
	}
	const available = new Set(input.available);
	for (const s of input.ifNeeded) {
		if (available.has(s)) throw badRequest(`Slot ${s} can't be both available and if needed.`);
	}
}

export function slotSet(columns: Column[]): Set<SlotId> {
	const set = new Set<SlotId>();
	for (const c of columns) for (const s of c.slots) set.add(s);
	return set;
}
