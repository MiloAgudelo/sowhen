import { describe, expect, it } from "vitest";
import { columnHeaderDate, formatUtcOffset, generateColumns, labelSlot, offsetShifts } from "@/domain";
import { utc, ZONE_MATRIX } from "./test-helpers";

describe("labelSlot", () => {
	it("Manila sees 'Nov 10, 09:00–18:00 Warsaw' as 16:00 … 00:30, +1 after midnight", () => {
		const [col] = generateColumns({
			dates: ["2027-11-10"],
			window: { start: "09:00", end: "18:00" },
			zone: "Europe/Warsaw",
		});
		const header = columnHeaderDate(col!, "Asia/Manila");
		expect(header).toBe("2027-11-10");
		const labels = col!.slots.map((s) => labelSlot(s, "Asia/Manila", header));
		expect(labels.map((l) => l.time)).toEqual([
			"16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00",
			"20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "00:30",
		]);
		expect(labels.map((l) => l.dayOffset)).toEqual([...Array(16).fill(0), 1, 1]);
		expect(labels.at(-1)).toEqual({ time: "00:30", dayOffset: 1, date: "2027-11-11" });
		expect(labels[0]).toEqual({ time: "16:00", dayOffset: 0, date: "2027-11-10" });
	});

	it("counts days from whatever column date is passed (header date vs creator date)", () => {
		// Warsaw 00:00 on Nov 10 is 18:00 on Nov 9 in Bogotá.
		const [col] = generateColumns({
			dates: ["2027-11-10"],
			window: { start: "00:00", end: "08:00" },
			zone: "Europe/Warsaw",
		});
		const header = columnHeaderDate(col!, "America/Bogota");
		expect(header).toBe("2027-11-09");
		const first = col!.slots[0]!;
		expect(labelSlot(first, "America/Bogota", header)).toEqual({ time: "18:00", dayOffset: 0, date: "2027-11-09" });
		expect(labelSlot(first, "America/Bogota", col!.date)).toEqual({
			time: "18:00",
			dayOffset: -1,
			date: "2027-11-09",
		});
		// Warsaw 06:00 is midnight in Bogotá: +1 relative to the header.
		expect(labelSlot(utc(2027, 11, 10, 5, 0), "America/Bogota", header)).toEqual({
			time: "00:00",
			dayOffset: 1,
			date: "2027-11-10",
		});
	});

	it("labels the same instant correctly across the zone matrix", () => {
		const slot = utc(2027, 11, 10, 12, 0);
		const expected: Record<(typeof ZONE_MATRIX)[number], [string, string]> = {
			"Europe/Warsaw": ["13:00", "2027-11-10"],
			"Europe/London": ["12:00", "2027-11-10"],
			"America/Bogota": ["07:00", "2027-11-10"],
			"America/New_York": ["07:00", "2027-11-10"], // EST after Nov 7
			"America/Mexico_City": ["06:00", "2027-11-10"], // no DST since 2022
			"Asia/Manila": ["20:00", "2027-11-10"],
			"Asia/Kolkata": ["17:30", "2027-11-10"],
			"Asia/Kathmandu": ["17:45", "2027-11-10"],
			"Pacific/Auckland": ["01:00", "2027-11-11"], // NZDT +13
		};
		for (const zone of ZONE_MATRIX) {
			const [time, date] = expected[zone];
			const label = labelSlot(slot, zone, "2027-11-10");
			expect({ zone, ...label }).toEqual({ zone, time, date, dayOffset: date === "2027-11-10" ? 0 : 1 });
		}
	});

	it("labels in summer use the summer offsets", () => {
		const slot = utc(2027, 7, 1, 12, 0);
		expect(labelSlot(slot, "Europe/Warsaw", "2027-07-01").time).toBe("14:00");
		expect(labelSlot(slot, "Europe/London", "2027-07-01").time).toBe("13:00");
		expect(labelSlot(slot, "America/New_York", "2027-07-01").time).toBe("08:00");
		expect(labelSlot(slot, "America/Mexico_City", "2027-07-01").time).toBe("06:00");
		expect(labelSlot(slot, "Pacific/Auckland", "2027-07-01")).toEqual({
			time: "00:00",
			dayOffset: 1,
			date: "2027-07-02",
		});
	});
});

describe("columnHeaderDate", () => {
	it("is the viewer-local date of the column's first slot, across the zone matrix", () => {
		// Warsaw midnight on Nov 10 = 23:00Z on Nov 9.
		const [col] = generateColumns({
			dates: ["2027-11-10"],
			window: { start: "00:00", end: "08:00" },
			zone: "Europe/Warsaw",
		});
		const expected: Record<(typeof ZONE_MATRIX)[number], string> = {
			"Europe/Warsaw": "2027-11-10",
			"Europe/London": "2027-11-09",
			"America/Bogota": "2027-11-09",
			"America/New_York": "2027-11-09",
			"America/Mexico_City": "2027-11-09",
			"Asia/Manila": "2027-11-10",
			"Asia/Kolkata": "2027-11-10",
			"Asia/Kathmandu": "2027-11-10",
			"Pacific/Auckland": "2027-11-10",
		};
		for (const zone of ZONE_MATRIX) expect([zone, columnHeaderDate(col!, zone)]).toEqual([zone, expected[zone]]);
	});

	it("falls back to the column date for an empty column", () => {
		expect(columnHeaderDate({ date: "2027-03-28", slots: [] }, "Asia/Manila")).toBe("2027-03-28");
	});
});

describe("offsetShifts", () => {
	const warsaw = (dates: string[], start = "09:00", end = "17:00") =>
		generateColumns({ dates, window: { start, end }, zone: "Europe/Warsaw" });
	const aroundEuSpring = warsaw(["2027-03-26", "2027-03-27", "2027-03-28", "2027-03-29"]);

	it("no shift when viewer and creator change together (London vs Warsaw)", () => {
		expect(offsetShifts(aroundEuSpring, "Europe/London", "Europe/Warsaw")).toEqual({ shifts: false, at: [] });
	});

	it("no shift for the creator's own zone", () => {
		expect(offsetShifts(aroundEuSpring, "Europe/Warsaw", "Europe/Warsaw")).toEqual({ shifts: false, at: [] });
	});

	it("shifts at the first slot after the creator's DST change (Bogotá vs Warsaw)", () => {
		expect(offsetShifts(aroundEuSpring, "America/Bogota", "Europe/Warsaw")).toEqual({
			shifts: true,
			at: [utc(2027, 3, 28, 7, 0)], // 09:00 CEST
		});
	});

	it("shifts at the viewer's DST change too (New York vs Warsaw, both 2027 spring changes)", () => {
		const cols = warsaw(["2027-03-13", "2027-03-14", "2027-03-27", "2027-03-28"]);
		expect(offsetShifts(cols, "America/New_York", "Europe/Warsaw")).toEqual({
			shifts: true,
			at: [utc(2027, 3, 14, 8, 0), utc(2027, 3, 28, 7, 0)],
		});
	});

	it("can shift in the middle of a column (24 h window)", () => {
		const cols = warsaw(["2027-10-31"], "00:00", "00:00");
		expect(offsetShifts(cols, "Asia/Kolkata", "Europe/Warsaw")).toEqual({
			shifts: true,
			at: [utc(2027, 10, 31, 1, 0)],
		});
	});

	it("no shift for zones without DST", () => {
		const cols = generateColumns({
			dates: ["2027-03-13", "2027-03-14", "2027-03-28"],
			window: { start: "09:00", end: "17:00" },
			zone: "Asia/Manila",
		});
		expect(offsetShifts(cols, "Asia/Kathmandu", "Asia/Manila").shifts).toBe(false);
	});

	it("handles no columns", () => {
		expect(offsetShifts([], "Asia/Manila", "Europe/Warsaw")).toEqual({ shifts: false, at: [] });
	});
});

describe("formatUtcOffset", () => {
	it("formats the zone matrix in winter (northern)", () => {
		const at = utc(2027, 11, 10, 12, 0);
		const expected: Record<(typeof ZONE_MATRIX)[number], string> = {
			"Europe/Warsaw": "UTC+1",
			"Europe/London": "UTC",
			"America/Bogota": "UTC−5",
			"America/New_York": "UTC−5",
			"America/Mexico_City": "UTC−6",
			"Asia/Manila": "UTC+8",
			"Asia/Kolkata": "UTC+5:30",
			"Asia/Kathmandu": "UTC+5:45",
			"Pacific/Auckland": "UTC+13",
		};
		for (const zone of ZONE_MATRIX) expect([zone, formatUtcOffset(zone, at)]).toEqual([zone, expected[zone]]);
	});

	it("formats the zone matrix in summer (northern)", () => {
		const at = utc(2027, 7, 1, 12, 0);
		const expected: Record<(typeof ZONE_MATRIX)[number], string> = {
			"Europe/Warsaw": "UTC+2",
			"Europe/London": "UTC+1",
			"America/Bogota": "UTC−5",
			"America/New_York": "UTC−4",
			"America/Mexico_City": "UTC−6",
			"Asia/Manila": "UTC+8",
			"Asia/Kolkata": "UTC+5:30",
			"Asia/Kathmandu": "UTC+5:45",
			"Pacific/Auckland": "UTC+12",
		};
		for (const zone of ZONE_MATRIX) expect([zone, formatUtcOffset(zone, at)]).toEqual([zone, expected[zone]]);
	});

	it("uses U+2212, not a hyphen", () => {
		const s = formatUtcOffset("America/Bogota", utc(2027, 1, 1));
		expect(s).toBe("UTC−5");
		expect(s).not.toContain("-");
	});

	it("follows the instant across a DST change", () => {
		expect(formatUtcOffset("Europe/London", utc(2027, 3, 28, 0, 30))).toBe("UTC");
		expect(formatUtcOffset("Europe/London", utc(2027, 3, 28, 1, 0))).toBe("UTC+1");
		expect(formatUtcOffset("America/New_York", utc(2027, 11, 7, 5, 30))).toBe("UTC−4");
		expect(formatUtcOffset("America/New_York", utc(2027, 11, 7, 6, 0))).toBe("UTC−5");
	});

	it("formats UTC itself and a negative half-hour offset", () => {
		expect(formatUtcOffset("UTC", 0)).toBe("UTC");
		expect(formatUtcOffset("America/St_Johns", utc(2027, 1, 1))).toBe("UTC−3:30");
	});
});
