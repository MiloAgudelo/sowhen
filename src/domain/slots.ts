// Slot generation (ADR 0001). Slots are UTC epoch minutes; wall times live in the creator zone.

import {
	type Column,
	type DailyWindow,
	type IsoDate,
	SLOT_MINUTES,
	type SlotId,
	type ZoneId,
} from "@/shared/types";
import { type Temporal, temporal } from "./temporal";

const WALL_TIME = /^([01]\d|2[0-3]):(00|30)$/;

/** Parses a "HH:MM" wall time on a 30-minute boundary into minutes after midnight. */
export function parseWallTime(time: string): number {
	const m = WALL_TIME.exec(time);
	if (!m) throw new RangeError(`Invalid wall time "${time}" (expected HH:MM on a 30-minute boundary)`);
	return Number(m[1]) * 60 + Number(m[2]);
}

/** Epoch minutes of a zoned instant. */
export function toSlotId(zdt: Temporal.ZonedDateTime): SlotId {
	return Math.floor(zdt.epochMilliseconds / 60_000);
}

/** The slot's start instant in a zone. */
export function slotToZoned(slot: SlotId, zone: ZoneId): Temporal.ZonedDateTime {
	return temporal().Instant.fromEpochMilliseconds(slot * 60_000).toZonedDateTimeISO(zone);
}

/**
 * Every instant at which a wall time occurs in the zone: none in a spring-forward gap, two in a
 * fall-back fold, one otherwise.
 */
function instantsForWallTime(pdt: Temporal.PlainDateTime, zone: ZoneId): SlotId[] {
	const earlier = pdt.toZonedDateTime(zone, { disambiguation: "earlier" });
	const later = pdt.toZonedDateTime(zone, { disambiguation: "later" });
	const out: SlotId[] = [];
	if (earlier.toPlainDateTime().equals(pdt)) out.push(toSlotId(earlier));
	if (later.toPlainDateTime().equals(pdt)) {
		const id = toSlotId(later);
		if (!out.includes(id)) out.push(id);
	}
	return out;
}

/**
 * Generates one column per date. Each column holds the 30-minute slots of the daily window on that
 * date in the creator zone, as UTC epoch minutes. Uses the zone's real offsets: on DST days a column
 * is shorter or longer, and wall times that don't exist (spring-forward gap) produce no slot.
 * A window with end < start runs past midnight into the next day; those slots stay in this column.
 * end === start means 24 hours.
 *
 * Works on wall-clock times: each 30-minute wall time in the window yields 0 (gap), 1 or 2 (fold)
 * slots. Throws RangeError on a malformed wall time or date.
 */
export function generateColumns(input: { dates: IsoDate[]; window: DailyWindow; zone: ZoneId }): Column[] {
	const startMin = parseWallTime(input.window.start);
	const endMin = parseWallTime(input.window.end);
	let lengthMin = endMin - startMin;
	if (lengthMin <= 0) lengthMin += 24 * 60; // crosses midnight, or 24 h when equal
	const steps = lengthMin / SLOT_MINUTES;

	return input.dates.map((date) => {
		const first = temporal().PlainDate.from(date).toPlainDateTime({
			hour: Math.floor(startMin / 60),
			minute: startMin % 60,
		});
		const slots = new Set<SlotId>();
		for (let i = 0; i < steps; i++) {
			for (const id of instantsForWallTime(first.add({ minutes: i * SLOT_MINUTES }), input.zone)) {
				slots.add(id);
			}
		}
		return { date, slots: [...slots].sort((a, b) => a - b) };
	});
}

/** All slots of all columns, ascending and unique. */
export function allSlots(columns: Column[]): SlotId[] {
	const set = new Set<SlotId>();
	for (const c of columns) for (const s of c.slots) set.add(s);
	return [...set].sort((a, b) => a - b);
}

/** End instant (exclusive) of the last slot, as epoch minutes. Throws RangeError if there are no slots. */
export function lastSlotEnd(columns: Column[]): SlotId {
	let max = -Infinity;
	for (const c of columns) for (const s of c.slots) if (s > max) max = s;
	if (max === -Infinity) throw new RangeError("lastSlotEnd: no slots");
	return max + SLOT_MINUTES;
}
