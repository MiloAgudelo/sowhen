import { describe, expect, it } from "vitest";
import { generateColumns, heat, rankBestTimes, tallySlots } from "@/domain";
import type { Column } from "@/shared/types";
import { response, utc } from "./test-helpers";

const T = utc(2027, 11, 10, 8, 0);
/** Slot i of a run starting at T. */
const s = (i: number) => T + 30 * i;
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => s(from + i));
const col = (date: string, slots: number[]): Column => ({ date, slots });

describe("tallySlots", () => {
	it("splits names into available, if needed and missing per slot", () => {
		const responses = [response("Ana", [s(0)], [s(1)]), response("Ben", [s(0), s(1)]), response("Chen")];
		const t = tallySlots([s(0), s(1), s(2)], responses);
		expect(t.get(s(0))).toEqual({ available: ["Ana", "Ben"], ifNeeded: [], missing: ["Chen"] });
		expect(t.get(s(1))).toEqual({ available: ["Ben"], ifNeeded: ["Ana"], missing: ["Chen"] });
		expect(t.get(s(2))).toEqual({ available: [], ifNeeded: [], missing: ["Ana", "Ben", "Chen"] });
		expect(t.size).toBe(3);
	});

	it("returns empty tallies with no responses", () => {
		expect(tallySlots([s(0)], []).get(s(0))).toEqual({ available: [], ifNeeded: [], missing: [] });
	});
});

describe("heat", () => {
	it("weights if needed at half", () => {
		expect(heat({ available: ["a", "b"], ifNeeded: [], missing: ["c"] })).toBeCloseTo(2 / 3);
		expect(heat({ available: ["a"], ifNeeded: ["b"], missing: ["c"] })).toBeCloseTo(0.5);
		expect(heat({ available: ["a", "b"], ifNeeded: [], missing: [] })).toBe(1);
		expect(heat({ available: [], ifNeeded: [], missing: ["a"] })).toBe(0);
	});

	it("is 0 when nobody answered", () => {
		expect(heat({ available: [], ifNeeded: [], missing: [] })).toBe(0);
	});
});

describe("rankBestTimes", () => {
	it("drops runs shorter than the meeting duration", () => {
		const cols = [col("2027-11-10", range(0, 3))];
		const r = [response("Ana", range(0, 3))];
		expect(rankBestTimes(cols, r, 120)).toEqual([]);
		expect(rankBestTimes(cols, r, 90)).toEqual([
			{ start: s(0), end: s(3), available: ["Ana"], ifNeeded: [], missing: [] },
		]);
	});

	it("a gap between columns breaks a run", () => {
		const cols = [col("2027-11-10", [s(0), s(1)]), col("2027-11-11", [s(3), s(4)])];
		const r = [response("Ana", [s(0), s(1), s(3), s(4)])];
		expect(rankBestTimes(cols, r, 90)).toEqual([]);
		expect(rankBestTimes(cols, r, 60).map((b) => [b.start, b.end])).toEqual([
			[s(0), s(2)],
			[s(3), s(5)],
		]);
	});

	it("non-consecutive slots inside a column break a run", () => {
		const cols = [col("2027-11-10", [s(0), s(1), s(3)])];
		expect(rankBestTimes(cols, [response("Ana", [s(0), s(1), s(3)])], 90)).toEqual([]);
	});

	it("columns that touch (24 h windows) form one run", () => {
		const cols = generateColumns({
			dates: ["2027-11-10", "2027-11-11"],
			window: { start: "00:00", end: "00:00" },
			zone: "Europe/Warsaw",
		});
		const lateNight = utc(2027, 11, 10, 22, 30); // 23:30 Warsaw on Nov 10, last slot of column 1
		const r = [response("Ana", [lateNight, lateNight + 30])];
		expect(rankBestTimes(cols, r, 60)).toEqual([
			{ start: lateNight, end: lateNight + 60, available: ["Ana"], ifNeeded: [], missing: [] },
		]);
	});

	describe("ranking and merging", () => {
		// Ana: all six slots. Ben: if needed 0–1, available 2–3. Chen: if needed 2–3, available 4–5.
		const cols = [col("2027-11-10", range(0, 6))];
		const responses = [
			response("Ana", range(0, 6)),
			response("Ben", [s(2), s(3)], [s(0), s(1)]),
			response("Chen", [s(4), s(5)], [s(2), s(3)]),
		];

		it("ranks by available, then fewer if needed, then earlier", () => {
			expect(rankBestTimes(cols, responses, 60)).toEqual([
				{ start: s(4), end: s(6), available: ["Ana", "Chen"], ifNeeded: [], missing: ["Ben"] },
				{ start: s(2), end: s(4), available: ["Ana", "Ben"], ifNeeded: ["Chen"], missing: [] },
				// windows s0–s2 and s1–s3 have the same attendance: merged into s0–s3
				{ start: s(0), end: s(3), available: ["Ana"], ifNeeded: ["Ben"], missing: ["Chen"] },
				{ start: s(3), end: s(5), available: ["Ana"], ifNeeded: ["Chen"], missing: ["Ben"] },
			]);
		});

		it("applies the limit", () => {
			expect(rankBestTimes(cols, responses, 60, 2).map((b) => b.start)).toEqual([s(4), s(2)]);
			expect(rankBestTimes(cols, responses, 60, 0)).toEqual([]);
		});

		it("merges a long stretch of identical attendance into one range", () => {
			const r = [response("Ana", range(0, 6)), response("Ben", range(0, 6))];
			expect(rankBestTimes(cols, r, 60)).toEqual([
				{ start: s(0), end: s(6), available: ["Ana", "Ben"], ifNeeded: [], missing: [] },
			]);
		});

		it("does not merge across a window nobody can attend", () => {
			const r = [response("Ana", [s(0), s(1), s(4), s(5)])];
			expect(rankBestTimes(cols, r, 60).map((b) => [b.start, b.end])).toEqual([
				[s(0), s(2)],
				[s(4), s(6)],
			]);
		});
	});

	it("defaults to at most 5 results", () => {
		const slots = Array.from({ length: 8 }, (_, i) => s(i * 3)); // 8 separate one-slot runs
		const cols = [col("2027-11-10", slots)];
		const out = rankBestTimes(cols, [response("Ana", slots)], 30);
		expect(out).toHaveLength(5);
		expect(out.map((b) => b.start)).toEqual(slots.slice(0, 5));
	});

	it("omits windows nobody can attend, and returns nothing without responses", () => {
		const cols = [col("2027-11-10", range(0, 4))];
		expect(rankBestTimes(cols, [], 60)).toEqual([]);
		expect(rankBestTimes(cols, [response("Ana")], 60)).toEqual([]);
	});

	it("includes windows where people are only if needed", () => {
		const cols = [col("2027-11-10", range(0, 2))];
		expect(rankBestTimes(cols, [response("Ana", [], range(0, 2)), response("Ben")], 60)).toEqual([
			{ start: s(0), end: s(2), available: [], ifNeeded: ["Ana"], missing: ["Ben"] },
		]);
	});

	it("requires availability for the whole window", () => {
		const cols = [col("2027-11-10", range(0, 2))];
		const r = [response("Ana", [s(0)]), response("Ben", [s(0)], [s(1)])];
		expect(rankBestTimes(cols, r, 60)).toEqual([
			{ start: s(0), end: s(2), available: [], ifNeeded: ["Ben"], missing: ["Ana"] },
		]);
	});

	it("rounds a duration that isn't a multiple of 30 up to whole slots", () => {
		const cols = [col("2027-11-10", range(0, 2))];
		expect(rankBestTimes(cols, [response("Ana", range(0, 2))], 45)).toEqual([
			{ start: s(0), end: s(2), available: ["Ana"], ifNeeded: [], missing: [] },
		]);
	});

	it("works on a real DST column (Warsaw, 2027-03-28)", () => {
		const cols = generateColumns({
			dates: ["2027-03-28"],
			window: { start: "01:00", end: "04:00" },
			zone: "Europe/Warsaw",
		});
		// 01:30 CET and 03:00 CEST are consecutive instants: a 1 h meeting fits across the gap.
		const r = [response("Ana", [utc(2027, 3, 28, 0, 30), utc(2027, 3, 28, 1, 0)])];
		expect(rankBestTimes(cols, r, 60)).toEqual([
			{ start: utc(2027, 3, 28, 0, 30), end: utc(2027, 3, 28, 1, 30), available: ["Ana"], ifNeeded: [], missing: [] },
		]);
	});
});
