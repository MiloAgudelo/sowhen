import { describe, expect, it } from "vitest";
import type { Selection } from "./Grid";
import { applyTarget, nearestIndex, rectSlots, stateOf, strokeTarget } from "./selection";

const sel = (available: number[], ifNeeded: number[]): Selection => ({
	available: new Set(available),
	ifNeeded: new Set(ifNeeded),
});

describe("strokeTarget", () => {
	it("paints, toggles off on a cell already painted with the same brush, and erases", () => {
		expect(strokeTarget("available", "unavailable")).toBe("available");
		expect(strokeTarget("available", "ifNeeded")).toBe("available");
		expect(strokeTarget("available", "available")).toBe("unavailable");
		expect(strokeTarget("ifNeeded", "ifNeeded")).toBe("unavailable");
		expect(strokeTarget("erase", "available")).toBe("unavailable");
	});
});

describe("applyTarget", () => {
	it("keeps available and ifNeeded disjoint and doesn't mutate the input", () => {
		const before = sel([1, 2], [3]);
		const after = applyTarget(before, [2, 3, 4], "ifNeeded");
		expect([...after.available]).toEqual([1]);
		expect([...after.ifNeeded].sort()).toEqual([2, 3, 4]);
		expect([...before.available]).toEqual([1, 2]);
		const erased = applyTarget(after, [1, 3], "unavailable");
		expect(stateOf(erased, 1)).toBe("unavailable");
		expect(stateOf(erased, 3)).toBe("unavailable");
		expect(stateOf(erased, 4)).toBe("ifNeeded");
	});
});

describe("rectSlots", () => {
	// 3 columns × 4 rows; column 1 has a gap at row 2. slot = col*100 + row.
	const slotAt = (c: number, r: number) => (c === 1 && r === 2 ? null : c * 100 + r);

	it("covers the rectangle in any drag direction, skipping gaps", () => {
		const fwd = rectSlots({ col: 0, row: 1 }, { col: 1, row: 3 }, [0, 1, 2, 3], slotAt);
		const back = rectSlots({ col: 1, row: 3 }, { col: 0, row: 1 }, [0, 1, 2, 3], slotAt);
		expect(fwd.sort((a, b) => a - b)).toEqual([1, 2, 3, 101, 103]);
		expect(back.sort((a, b) => a - b)).toEqual(fwd);
	});

	it("skips hidden rows", () => {
		expect(rectSlots({ col: 2, row: 0 }, { col: 2, row: 3 }, [0, 3], slotAt)).toEqual([200, 203]);
	});
});

describe("nearestIndex", () => {
	const ranges = [
		{ start: 0, end: 10 },
		{ start: 10, end: 20 },
		{ start: 28, end: 38 },
	];
	it("finds the containing range or the nearest one", () => {
		expect(nearestIndex(ranges, -5)).toBe(0);
		expect(nearestIndex(ranges, 15)).toBe(1);
		expect(nearestIndex(ranges, 22)).toBe(1);
		expect(nearestIndex(ranges, 27)).toBe(2);
		expect(nearestIndex(ranges, 100)).toBe(2);
		expect(nearestIndex([], 1)).toBe(-1);
	});
});
