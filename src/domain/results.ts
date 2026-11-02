// Results: tallies, heatmap and best times (ADR 0006).

import { type BestTime, type Column, type ResponseDto, SLOT_MINUTES, type SlotId } from "@/shared/types";
import { allSlots } from "./slots";

export interface SlotTally {
	available: string[]; // display names
	ifNeeded: string[];
	missing: string[];
}

function indexResponses(responses: ResponseDto[]) {
	return responses.map((r) => ({ name: r.name, a: new Set(r.available), i: new Set(r.ifNeeded) }));
}

/** Who is available / if needed / missing in each slot. Names keep the order of `responses`. */
export function tallySlots(slots: SlotId[], responses: ResponseDto[]): Map<SlotId, SlotTally> {
	const people = indexResponses(responses);
	const out = new Map<SlotId, SlotTally>();
	for (const slot of slots) {
		const t: SlotTally = { available: [], ifNeeded: [], missing: [] };
		for (const p of people) {
			if (p.a.has(slot)) t.available.push(p.name);
			else if (p.i.has(slot)) t.ifNeeded.push(p.name);
			else t.missing.push(p.name);
		}
		out.set(slot, t);
	}
	return out;
}

/**
 * Heat value 0..1 for a slot: (available + 0.5 × ifNeeded) / respondents. 0 when nobody answered.
 */
export function heat(tally: SlotTally): number {
	const n = tally.available.length + tally.ifNeeded.length + tally.missing.length;
	if (n === 0) return 0;
	return (tally.available.length + 0.5 * tally.ifNeeded.length) / n;
}

/** Splits ascending slots into runs with no gap between one slot's end and the next one's start. */
function consecutiveRuns(slots: SlotId[]): SlotId[][] {
	const runs: SlotId[][] = [];
	let run: SlotId[] = [];
	for (const s of slots) {
		const last = run[run.length - 1];
		if (last !== undefined && s !== last + SLOT_MINUTES) {
			runs.push(run);
			run = [];
		}
		run.push(s);
	}
	if (run.length) runs.push(run);
	return runs;
}

const sameNames = (a: string[], b: string[]) => a.length === b.length && a.every((n, i) => n === b[i]);

/**
 * Ranked best times. Considers every run of consecutive slots (no gap between slot end and next
 * start) of at least `durationMinutes`, and returns windows exactly `durationMinutes` long, merged
 * where adjacent windows have identical attendance. Ranking: more available first; then fewer
 * ifNeeded among the rest; then earlier start. Returns at most `limit` (default 5); omits windows
 * nobody can attend.
 *
 * Details: runs are built from all slots of all columns, so two columns that touch (24-hour windows
 * on consecutive dates) form one run; any gap breaks it. A duration that isn't a multiple of 30 is
 * rounded up to whole slots. Adjacent windows (start 30 min apart) merge only when both the
 * available and the if-needed names are the same; overlapping windows with different attendance
 * are listed separately.
 */
export function rankBestTimes(
	columns: Column[],
	responses: ResponseDto[],
	durationMinutes: number,
	limit = 5,
): BestTime[] {
	const k = Math.max(1, Math.ceil(durationMinutes / SLOT_MINUTES));
	const people = indexResponses(responses);
	const candidates: BestTime[] = [];

	for (const run of consecutiveRuns(allSlots(columns))) {
		let prev: BestTime | undefined;
		for (let i = 0; i + k <= run.length; i++) {
			const window = run.slice(i, i + k);
			const end = window[k - 1]! + SLOT_MINUTES;
			const bt: BestTime = { start: window[0]!, end, available: [], ifNeeded: [], missing: [] };
			for (const p of people) {
				if (window.every((s) => p.a.has(s))) bt.available.push(p.name);
				else if (window.every((s) => p.a.has(s) || p.i.has(s))) bt.ifNeeded.push(p.name);
				else bt.missing.push(p.name);
			}
			if (bt.available.length + bt.ifNeeded.length === 0) {
				prev = undefined;
				continue;
			}
			if (prev && sameNames(prev.available, bt.available) && sameNames(prev.ifNeeded, bt.ifNeeded)) {
				prev.end = end;
			} else {
				candidates.push(bt);
				prev = bt;
			}
		}
	}

	candidates.sort(
		(x, y) =>
			y.available.length - x.available.length ||
			x.ifNeeded.length - y.ifNeeded.length ||
			x.start - y.start,
	);
	return candidates.slice(0, Math.max(0, limit));
}
