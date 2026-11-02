// Display in the viewer zone (ADR 0003).

import { Temporal } from "temporal-polyfill";
import type { Column, IsoDate, SlotId, ZoneId } from "@/shared/types";
import { allSlots, slotToZoned } from "./slots";

export interface SlotLabel {
	/** "HH:MM" in the viewer zone, 24-hour. */
	time: string;
	/** Days between the column's viewer-local date and this slot's viewer-local date (0, +1, -1). */
	dayOffset: number;
	/** Viewer-local date of this slot, "YYYY-MM-DD". */
	date: IsoDate;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Labels a slot in the viewer zone. `dayOffset` is the number of days from `columnDate` to the
 * slot's viewer-local date. Pass `columnHeaderDate(column, viewerZone)` as `columnDate` to get the
 * next-day marker of ADR 0003 (0 or +1). Passing the creator-zone `Column.date` instead also works
 * and can give −1 for viewers west of the creator.
 */
export function labelSlot(slot: SlotId, viewerZone: ZoneId, columnDate: IsoDate): SlotLabel {
	const zdt = slotToZoned(slot, viewerZone);
	const date = zdt.toPlainDate();
	return {
		time: `${pad(zdt.hour)}:${pad(zdt.minute)}`,
		dayOffset: Temporal.PlainDate.from(columnDate).until(date).days,
		date: date.toString(),
	};
}

/** Viewer-local date of a column's first slot (used for column headers). `column.date` if it has no slots. */
export function columnHeaderDate(column: Column, viewerZone: ZoneId): IsoDate {
	const first = column.slots[0];
	if (first === undefined) return column.date;
	return slotToZoned(first, viewerZone).toPlainDate().toString();
}

/** UTC offset of a zone at a slot, in minutes. */
export function offsetMinutes(zone: ZoneId, at: SlotId): number {
	return Math.round(slotToZoned(at, zone).offsetNanoseconds / 60e9);
}

/**
 * True when the viewer↔creator offset differs between columns (DST inside the event), so row
 * labels must be shown per column, plus the instant(s) where the shift happens for the notice.
 * `at` lists every slot (in time order) whose viewer−creator offset differs from the previous
 * slot's; a shift can fall in the middle of a column.
 */
export function offsetShifts(
	columns: Column[],
	viewerZone: ZoneId,
	creatorZone: ZoneId,
): { shifts: boolean; at: SlotId[] } {
	const at: SlotId[] = [];
	let prev: number | undefined;
	for (const slot of allSlots(columns)) {
		const diff = offsetMinutes(viewerZone, slot) - offsetMinutes(creatorZone, slot);
		if (prev !== undefined && diff !== prev) at.push(slot);
		prev = diff;
	}
	return { shifts: at.length > 0, at };
}

/** e.g. "UTC−5", "UTC+5:45", "UTC" for zero. Uses U+2212 for minus. */
export function formatUtcOffset(zone: ZoneId, at: SlotId): string {
	const total = offsetMinutes(zone, at);
	if (total === 0) return "UTC";
	const sign = total < 0 ? "−" : "+";
	const abs = Math.abs(total);
	const h = Math.floor(abs / 60);
	const m = abs % 60;
	return `UTC${sign}${h}${m ? `:${pad(m)}` : ""}`;
}
