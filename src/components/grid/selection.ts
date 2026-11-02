// Pure painting helpers: rectangle strokes and brush application. No DOM, no React.

import type { SlotId } from "@/shared/types";
import type { Brush, Selection } from "./Grid";
import type { CellPos } from "./layout";

export type CellState = "available" | "ifNeeded" | "unavailable";

export function stateOf(sel: Selection, slot: SlotId): CellState {
	if (sel.available.has(slot)) return "available";
	if (sel.ifNeeded.has(slot)) return "ifNeeded";
	return "unavailable";
}

/**
 * What a stroke writes. Erase writes unavailable. A paint brush toggles: starting a stroke on a cell
 * that already has the brush's state clears the rectangle instead (when2meet style).
 */
export function strokeTarget(brush: Brush, anchorState: CellState): CellState {
	if (brush === "erase") return "unavailable";
	return anchorState === brush ? "unavailable" : brush;
}

/** Writes `target` to every slot. Returns new sets; `available` and `ifNeeded` stay disjoint. */
export function applyTarget(sel: Selection, slots: Iterable<SlotId>, target: CellState): Selection {
	const available = new Set(sel.available);
	const ifNeeded = new Set(sel.ifNeeded);
	for (const s of slots) {
		available.delete(s);
		ifNeeded.delete(s);
		if (target === "available") available.add(s);
		else if (target === "ifNeeded") ifNeeded.add(s);
	}
	return { available, ifNeeded };
}

/**
 * Slots in the rectangle between two cells (inclusive), over the given visible rows only.
 * Gaps (null cells) and hidden rows are skipped.
 */
export function rectSlots(
	a: CellPos,
	b: CellPos,
	visibleRows: readonly number[],
	slotAt: (col: number, row: number) => SlotId | null,
): SlotId[] {
	const c0 = Math.min(a.col, b.col);
	const c1 = Math.max(a.col, b.col);
	const r0 = Math.min(a.row, b.row);
	const r1 = Math.max(a.row, b.row);
	const out: SlotId[] = [];
	for (let c = c0; c <= c1; c++) {
		for (const r of visibleRows) {
			if (r < r0 || r > r1) continue;
			const s = slotAt(c, r);
			if (s !== null) out.push(s);
		}
	}
	return out;
}

/** Index of the range containing `x`, or the nearest one. Ranges are ascending and non-overlapping. */
export function nearestIndex(ranges: readonly { start: number; end: number }[], x: number): number {
	if (ranges.length === 0) return -1;
	let lo = 0;
	let hi = ranges.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (x >= ranges[mid]!.end) lo = mid + 1;
		else hi = mid;
	}
	// lo is the first range whose end > x (or the last). Pick the closer of lo-1 and lo.
	const cur = ranges[lo]!;
	const prev = ranges[lo - 1];
	if (x < cur.start && prev && cur.start - x > x - prev.end) return lo - 1;
	return lo;
}
