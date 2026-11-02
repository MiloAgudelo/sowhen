// Pure layout model for the availability grid (ADR 0001, 0003). No DOM, no React.
//
// Row alignment: every slot gets a key = creator-zone wall-clock minutes since the *column date's*
// midnight (so a midnight-crossing window continues at 1440+), plus an occurrence index for wall
// times that repeat on a fall-back day. Rows are the union of all columns' keys, ordered so that
// each column keeps its own time order. A spring-forward column therefore has null cells (gaps) at
// the missing wall times, and a fall-back column adds rows that are gaps in every other column.
// No slot is ever invented or dropped.

import { columnHeaderDate, labelSlot, offsetShifts, slotToZoned } from "@/domain";
import type { Column, IsoDate, SlotId, ZoneId } from "@/shared/types";
import { SLOT_MINUTES } from "@/shared/types";

export interface CellInfo {
	slot: SlotId;
	/** Viewer-local "HH:MM". */
	time: string;
	/** Viewer-local "HH:MM" of the slot's end. */
	endTime: string;
	/** Viewer-local minutes since midnight (0..1439). */
	minutes: number;
	/** Days from the column header date to this slot's viewer-local date (0, +1, …). */
	dayOffset: number;
	/** Viewer-local date of the slot. */
	date: IsoDate;
	/** "Tue 10 Nov" for `date`. */
	dateLabel: string;
	/** Creator-zone "HH:MM". */
	creatorTime: string;
}

export interface GridColumnModel {
	index: number;
	/** Event date (creator zone). */
	date: IsoDate;
	/** Viewer-local date of the column's first slot. */
	headerDate: IsoDate;
	/** "Tue". */
	weekday: string;
	/** "10 Nov". */
	dayMonth: string;
	/** True when the previous column's event date is not the day before this one. */
	gapBefore: boolean;
	slotCount: number;
}

export interface GridModel {
	columns: GridColumnModel[];
	rowCount: number;
	/** cells[col][row]. null = no slot at this position (DST gap or ragged column). */
	cells: (CellInfo | null)[][];
	/** The label shown in the time gutter for each row: the first non-null cell of the row. */
	rowLabels: (CellInfo | null)[];
	/** True when a row's cells don't all share the same local time: cells show their own label. */
	perColumnLabels: boolean;
	/** Instants where the viewer↔creator offset changes (for the page's notice). */
	shiftAt: SlotId[];
	/** Where each slot is drawn. */
	positions: Map<SlotId, { col: number; row: number }>;
}

export interface CellPos {
	col: number;
	row: number;
}

// ---- Date formatting

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

const dateParts = new Intl.DateTimeFormat("en-GB", {
	timeZone: "UTC",
	weekday: "short",
	day: "numeric",
	month: "short",
});

function isoToUtcMs(iso: IsoDate): number {
	const [y, m, d] = iso.split("-").map(Number);
	return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Days from `a` to `b` (both "YYYY-MM-DD"). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
	return Math.round((isoToUtcMs(b) - isoToUtcMs(a)) / DAY_MS);
}

/** { weekday: "Tue", dayMonth: "10 Nov" } for an ISO date. */
export function formatIsoDate(iso: IsoDate): { weekday: string; dayMonth: string; full: string } {
	const parts = dateParts.formatToParts(new Date(isoToUtcMs(iso)));
	const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
	const weekday = get("weekday");
	const dayMonth = `${get("day")} ${get("month")}`;
	return { weekday, dayMonth, full: `${weekday} ${dayMonth}` };
}

/** "Bogotá"-style short name from an IANA zone. One implementation, so the grid and the zone bar agree. */
export { zoneCity } from "@/lib/zones";

// ---- Row alignment

interface RowNode {
	key: number;
	occ: number;
	indeg: number;
	next: Set<string>;
}

/** Creator-zone wall minutes since the midnight that starts `columnDate`. */
function wallKey(slot: SlotId, creatorZone: ZoneId, columnDate: IsoDate): number {
	const z = slotToZoned(slot, creatorZone);
	const days = daysBetween(columnDate, z.toPlainDate().toString());
	return days * 1440 + z.hour * 60 + z.minute;
}

/**
 * Aligns columns into rows. Returns, per column, the slot at each row (null for gaps).
 * Every slot of every column appears exactly once.
 */
export function alignRows(columns: Column[], creatorZone: ZoneId): { rowCount: number; grid: (SlotId | null)[][] } {
	const nodes = new Map<string, RowNode>();
	const colIds: string[][] = [];

	for (const col of columns) {
		const seen = new Map<number, number>();
		const ids: string[] = [];
		let prev: string | null = null;
		for (const slot of col.slots) {
			const key = wallKey(slot, creatorZone, col.date);
			const occ = seen.get(key) ?? 0;
			seen.set(key, occ + 1);
			const id = `${key}#${occ}`;
			let node = nodes.get(id);
			if (!node) {
				node = { key, occ, indeg: 0, next: new Set() };
				nodes.set(id, node);
			}
			if (prev !== null) {
				const p = nodes.get(prev);
				if (p && !p.next.has(id)) {
					p.next.add(id);
					node.indeg++;
				}
			}
			ids.push(id);
			prev = id;
		}
		colIds.push(ids);
	}

	// Kahn's algorithm, always taking the ready node with the smallest (key, occ).
	const order: string[] = [];
	const ready = [...nodes].filter(([, n]) => n.indeg === 0).map(([id]) => id);
	const cmp = (a: string, b: string) => {
		const na = nodes.get(a)!;
		const nb = nodes.get(b)!;
		return na.key - nb.key || na.occ - nb.occ;
	};
	while (ready.length > 0) {
		ready.sort(cmp);
		const id = ready.shift()!;
		order.push(id);
		for (const n of nodes.get(id)!.next) {
			const node = nodes.get(n)!;
			node.indeg--;
			if (node.indeg === 0) ready.push(n);
		}
	}
	// A cycle can't happen with consistent clocks; if it ever does, append the rest in key order.
	if (order.length < nodes.size) {
		const placed = new Set(order);
		order.push(...[...nodes.keys()].filter((id) => !placed.has(id)).sort(cmp));
	}

	const rowOf = new Map(order.map((id, i) => [id, i]));
	const grid = columns.map((col, c) => {
		const out: (SlotId | null)[] = new Array(order.length).fill(null);
		const ids = colIds[c] ?? [];
		col.slots.forEach((slot, i) => {
			const row = rowOf.get(ids[i] ?? "");
			if (row !== undefined) out[row] = slot;
		});
		return out;
	});
	return { rowCount: order.length, grid };
}

// ---- Full model

export function buildGridModel(columns: Column[], viewerZone: ZoneId, creatorZone: ZoneId): GridModel {
	const { rowCount, grid } = alignRows(columns, creatorZone);
	const positions = new Map<SlotId, CellPos>();
	const dateLabels = new Map<IsoDate, string>();
	const dateLabel = (iso: IsoDate) => {
		let s = dateLabels.get(iso);
		if (s === undefined) {
			s = formatIsoDate(iso).full;
			dateLabels.set(iso, s);
		}
		return s;
	};

	const modelColumns: GridColumnModel[] = [];
	const cells: (CellInfo | null)[][] = [];

	columns.forEach((col, c) => {
		const headerDate = columnHeaderDate(col, viewerZone);
		const { weekday, dayMonth } = formatIsoDate(headerDate);
		const prev = columns[c - 1];
		modelColumns.push({
			index: c,
			date: col.date,
			headerDate,
			weekday,
			dayMonth,
			gapBefore: prev !== undefined && daysBetween(prev.date, col.date) > 1,
			slotCount: col.slots.length,
		});
		const colCells = (grid[c] ?? []).map((slot, row): CellInfo | null => {
			if (slot === null) return null;
			positions.set(slot, { col: c, row });
			const label = labelSlot(slot, viewerZone, headerDate);
			const end = labelSlot(slot + SLOT_MINUTES, viewerZone, headerDate);
			const [h, m] = label.time.split(":").map(Number);
			const cz = slotToZoned(slot, creatorZone);
			return {
				slot,
				time: label.time,
				endTime: end.time,
				minutes: (h ?? 0) * 60 + (m ?? 0),
				// Computed here rather than trusting labelSlot's reading of its third argument.
				dayOffset: daysBetween(headerDate, label.date),
				date: label.date,
				dateLabel: dateLabel(label.date),
				creatorTime: `${pad(cz.hour)}:${pad(cz.minute)}`,
			};
		});
		cells.push(colCells);
	});

	const rowLabels: (CellInfo | null)[] = [];
	let labelsDiffer = false;
	for (let r = 0; r < rowCount; r++) {
		let ref: CellInfo | null = null;
		for (const col of cells) {
			const cell = col[r] ?? null;
			if (!cell) continue;
			if (!ref) ref = cell;
			else if (cell.time !== ref.time || cell.dayOffset !== ref.dayOffset) labelsDiffer = true;
		}
		rowLabels.push(ref);
	}

	const shifts = columns.length > 0 ? offsetShifts(columns, viewerZone, creatorZone) : { shifts: false, at: [] };

	return {
		columns: modelColumns,
		rowCount,
		cells,
		rowLabels,
		perColumnLabels: labelsDiffer || shifts.shifts,
		shiftAt: shifts.at,
		positions,
	};
}

export function cellAt(model: GridModel, col: number, row: number): CellInfo | null {
	return model.cells[col]?.[row] ?? null;
}

// ---- Night hours (00:00–07:00 viewer-local)

export const NIGHT_END_MINUTES = 7 * 60;

/** True for rows whose every cell starts between 00:00 and 07:00 viewer-local. */
export function nightRows(model: GridModel): boolean[] {
	const out: boolean[] = [];
	for (let r = 0; r < model.rowCount; r++) {
		let any = false;
		let night = true;
		for (const col of model.cells) {
			const cell = col[r];
			if (!cell) continue;
			any = true;
			if (cell.minutes >= NIGHT_END_MINUTES) {
				night = false;
				break;
			}
		}
		out.push(any && night);
	}
	return out;
}

export type RowSegment = { kind: "row"; row: number } | { kind: "hidden"; from: number; to: number };

/** Visible rows plus collapsed runs of hidden rows. Never hides every row. */
export function rowSegments(model: GridModel, hideNight: boolean): { segments: RowSegment[]; visible: number[] } {
	const night = hideNight ? nightRows(model) : [];
	const hideAll = hideNight && night.length > 0 && night.every(Boolean);
	const segments: RowSegment[] = [];
	const visible: number[] = [];
	for (let r = 0; r < model.rowCount; r++) {
		if (hideNight && !hideAll && night[r]) {
			const last = segments[segments.length - 1];
			if (last?.kind === "hidden" && last.to === r - 1) last.to = r;
			else segments.push({ kind: "hidden", from: r, to: r });
		} else {
			segments.push({ kind: "row", row: r });
			visible.push(r);
		}
	}
	return { segments, visible };
}

/** The visible row closest to 08:00 viewer-local (within 07:30–09:00), or null. */
export function scrollTargetRow(model: GridModel, visible: readonly number[]): number | null {
	let best: number | null = null;
	let bestDist = Infinity;
	for (const r of visible) {
		const label = model.rowLabels[r];
		if (!label || label.minutes < 450 || label.minutes >= 540) continue;
		const dist = Math.abs(label.minutes - 480);
		if (dist < bestDist) {
			best = r;
			bestDist = dist;
		}
	}
	return best;
}

// ---- Keyboard navigation

export type Direction = "up" | "down" | "left" | "right";

/** Next non-gap cell from `from` in a direction, over visible rows only. Null if none. */
export function step(model: GridModel, visible: readonly number[], from: CellPos, dir: Direction): CellPos | null {
	if (dir === "up" || dir === "down") {
		const i = visible.indexOf(from.row);
		if (i < 0) return null;
		const d = dir === "down" ? 1 : -1;
		for (let j = i + d; j >= 0 && j < visible.length; j += d) {
			const row = visible[j]!;
			if (cellAt(model, from.col, row)) return { col: from.col, row };
		}
		return null;
	}
	const d = dir === "right" ? 1 : -1;
	for (let c = from.col + d; c >= 0 && c < model.columns.length; c += d) {
		if (cellAt(model, c, from.row)) return { col: c, row: from.row };
	}
	return null;
}

/** First non-gap cell in the given visible rows, starting at `preferRow` if possible. */
export function firstCell(model: GridModel, visible: readonly number[], preferRow: number | null): CellPos | null {
	const rows = preferRow === null ? visible : [preferRow, ...visible.filter((r) => r !== preferRow)];
	for (const row of rows) {
		for (let c = 0; c < model.columns.length; c++) {
			if (cellAt(model, c, row)) return { col: c, row };
		}
	}
	return null;
}

/** Highlight edges for a [start, end) range: which sides of each in-range cell get an outline. */
export function highlightEdges(
	model: GridModel,
	range: { start: SlotId; end: SlotId } | null | undefined,
): Map<SlotId, { top: boolean; bottom: boolean }> {
	const out = new Map<SlotId, { top: boolean; bottom: boolean }>();
	if (!range) return out;
	const inRange = (s: SlotId) => s >= range.start && s < range.end;
	for (const col of model.cells) {
		let prev: CellInfo | null = null;
		const present = col.filter((c): c is CellInfo => c !== null);
		present.forEach((cell, i) => {
			if (inRange(cell.slot)) {
				const next = present[i + 1];
				out.set(cell.slot, {
					top: !prev || !inRange(prev.slot),
					bottom: !next || !inRange(next.slot),
				});
			}
			prev = cell;
		});
	}
	return out;
}
