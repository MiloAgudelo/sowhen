import { describe, expect, it } from "vitest";
import { allSlots, generateColumns, lastSlotEnd } from "@/domain";
import { utc } from "./test-helpers";

const one = (date: string, start: string, end: string, zone: string) => {
	const [col] = generateColumns({ dates: [date], window: { start, end }, zone });
	return col!.slots;
};

const isContinuous = (slots: number[]) => slots.every((s, i) => i === 0 || s === slots[i - 1]! + 30);

describe("generateColumns", () => {
	it("cuts a plain window into 30-minute UTC slots", () => {
		const slots = one("2027-11-10", "09:00", "17:00", "Europe/Warsaw");
		expect(slots).toHaveLength(16);
		expect(slots[0]).toBe(utc(2027, 11, 10, 8, 0));
		expect(slots.at(-1)).toBe(utc(2027, 11, 10, 15, 30));
		expect(isContinuous(slots)).toBe(true);
	});

	it("uses the summer offset in summer", () => {
		expect(one("2027-07-01", "09:00", "10:00", "Europe/Warsaw")).toEqual([
			utc(2027, 7, 1, 7, 0),
			utc(2027, 7, 1, 7, 30),
		]);
	});

	describe("EU spring forward, 2027-03-28 Europe/Warsaw", () => {
		it("a 24 h window gives 46 slots", () => {
			const slots = one("2027-03-28", "00:00", "00:00", "Europe/Warsaw");
			expect(slots).toHaveLength(46);
			expect(slots[0]).toBe(utc(2027, 3, 27, 23, 0));
			expect(slots.at(-1)).toBe(utc(2027, 3, 28, 21, 30));
			expect(isContinuous(slots)).toBe(true);
		});

		it("a 01:00–04:00 window gives 4 slots (02:00–03:00 doesn't exist)", () => {
			expect(one("2027-03-28", "01:00", "04:00", "Europe/Warsaw")).toEqual([
				utc(2027, 3, 28, 0, 0), // 01:00 CET
				utc(2027, 3, 28, 0, 30), // 01:30 CET
				utc(2027, 3, 28, 1, 0), // 03:00 CEST
				utc(2027, 3, 28, 1, 30), // 03:30 CEST
			]);
		});

		it("a window entirely inside the gap gives no slots", () => {
			expect(one("2027-03-28", "02:00", "03:00", "Europe/Warsaw")).toEqual([]);
		});

		it("a midnight-crossing window from the day before loses the gap", () => {
			expect(one("2027-03-27", "20:00", "04:00", "Europe/Warsaw")).toHaveLength(14);
		});
	});

	describe("EU fall back, 2027-10-31 Europe/Warsaw", () => {
		it("a 24 h window gives 50 slots", () => {
			const slots = one("2027-10-31", "00:00", "00:00", "Europe/Warsaw");
			expect(slots).toHaveLength(50);
			expect(isContinuous(slots)).toBe(true);
		});

		it("the repeated hour 02:00–03:00 gives extra slots, in time order", () => {
			expect(one("2027-10-31", "01:00", "04:00", "Europe/Warsaw")).toEqual([
				utc(2027, 10, 30, 23, 0), // 01:00 CEST
				utc(2027, 10, 30, 23, 30), // 01:30 CEST
				utc(2027, 10, 31, 0, 0), // 02:00 CEST
				utc(2027, 10, 31, 0, 30), // 02:30 CEST
				utc(2027, 10, 31, 1, 0), // 02:00 CET
				utc(2027, 10, 31, 1, 30), // 02:30 CET
				utc(2027, 10, 31, 2, 0), // 03:00 CET
				utc(2027, 10, 31, 2, 30), // 03:30 CET
			]);
		});
	});

	describe("US DST, America/New_York", () => {
		it("columns around Mar 14 have 48, 46, 48 slots", () => {
			const cols = generateColumns({
				dates: ["2027-03-13", "2027-03-14", "2027-03-15"],
				window: { start: "00:00", end: "00:00" },
				zone: "America/New_York",
			});
			expect(cols.map((c) => c.slots.length)).toEqual([48, 46, 48]);
		});

		it("Nov 7 has 50 slots", () => {
			expect(one("2027-11-07", "00:00", "00:00", "America/New_York")).toHaveLength(50);
		});

		it("Nov 7 is a normal day in Warsaw", () => {
			expect(one("2027-11-07", "00:00", "00:00", "Europe/Warsaw")).toHaveLength(48);
		});
	});

	it("puts after-midnight slots of a 20:00–02:00 window in the start date's column", () => {
		const cols = generateColumns({
			dates: ["2027-11-10", "2027-11-11"],
			window: { start: "20:00", end: "02:00" },
			zone: "Europe/Warsaw",
		});
		expect(cols.map((c) => c.date)).toEqual(["2027-11-10", "2027-11-11"]);
		const first = cols[0]!.slots;
		expect(first).toHaveLength(12);
		expect(first[0]).toBe(utc(2027, 11, 10, 19, 0));
		expect(first.at(-1)).toBe(utc(2027, 11, 11, 0, 30)); // 01:30 Warsaw on Nov 11
		expect(cols[1]!.slots[0]).toBe(utc(2027, 11, 11, 19, 0));
	});

	it("treats end === start as 24 hours", () => {
		const slots = one("2027-11-10", "09:00", "09:00", "Europe/Warsaw");
		expect(slots).toHaveLength(48);
		expect(slots[0]).toBe(utc(2027, 11, 10, 8, 0));
		expect(slots.at(-1)).toBe(utc(2027, 11, 11, 7, 30));
	});

	it("handles non-consecutive dates, one column each, in the given order", () => {
		const cols = generateColumns({
			dates: ["2027-11-08", "2027-11-10", "2027-11-12"],
			window: { start: "10:00", end: "11:00" },
			zone: "America/Bogota",
		});
		expect(cols).toEqual([
			{ date: "2027-11-08", slots: [utc(2027, 11, 8, 15, 0), utc(2027, 11, 8, 15, 30)] },
			{ date: "2027-11-10", slots: [utc(2027, 11, 10, 15, 0), utc(2027, 11, 10, 15, 30)] },
			{ date: "2027-11-12", slots: [utc(2027, 11, 12, 15, 0), utc(2027, 11, 12, 15, 30)] },
		]);
	});

	it("handles :30 and :45 offsets", () => {
		expect(one("2027-11-10", "09:00", "10:00", "Asia/Kolkata")).toEqual([
			utc(2027, 11, 10, 3, 30),
			utc(2027, 11, 10, 4, 0),
		]);
		expect(one("2027-11-10", "09:00", "10:00", "Asia/Kathmandu")).toEqual([
			utc(2027, 11, 10, 3, 15),
			utc(2027, 11, 10, 3, 45),
		]);
	});

	it("handles Pacific/Auckland across the date line", () => {
		// NZDT (+13) in November: 09:00 on Nov 10 is 20:00Z on Nov 9.
		expect(one("2027-11-10", "09:00", "09:30", "Pacific/Auckland")).toEqual([utc(2027, 11, 9, 20, 0)]);
	});

	it("rejects malformed wall times", () => {
		const bad = (start: string, end: string) => () =>
			generateColumns({ dates: ["2027-11-10"], window: { start, end }, zone: "Europe/Warsaw" });
		expect(bad("9:00", "10:00")).toThrow(RangeError);
		expect(bad("09:15", "10:00")).toThrow(RangeError);
		expect(bad("09:00", "24:00")).toThrow(RangeError);
	});

	it("returns no columns for no dates", () => {
		expect(generateColumns({ dates: [], window: { start: "09:00", end: "10:00" }, zone: "UTC" })).toEqual([]);
	});
});

describe("allSlots / lastSlotEnd", () => {
	const cols = [
		{ date: "2027-11-11", slots: [300, 330] },
		{ date: "2027-11-10", slots: [0, 30, 60] },
	];

	it("allSlots flattens ascending and unique", () => {
		expect(allSlots(cols)).toEqual([0, 30, 60, 300, 330]);
		expect(allSlots([{ date: "a", slots: [30, 60] }, { date: "b", slots: [60, 90] }])).toEqual([30, 60, 90]);
		expect(allSlots([])).toEqual([]);
	});

	it("lastSlotEnd is the exclusive end of the latest slot", () => {
		expect(lastSlotEnd(cols)).toBe(360);
		const real = generateColumns({
			dates: ["2027-11-10"],
			window: { start: "20:00", end: "02:00" },
			zone: "Europe/Warsaw",
		});
		expect(lastSlotEnd(real)).toBe(utc(2027, 11, 11, 1, 0));
	});

	it("lastSlotEnd throws when there are no slots", () => {
		expect(() => lastSlotEnd([])).toThrow(RangeError);
		expect(() => lastSlotEnd([{ date: "2027-03-28", slots: [] }])).toThrow(RangeError);
	});
});
