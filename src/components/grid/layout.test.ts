import { describe, expect, it } from "vitest";
import { generateColumns } from "@/domain";
import type { Column } from "@/shared/types";
import {
	alignRows,
	buildGridModel,
	cellAt,
	daysBetween,
	formatIsoDate,
	highlightEdges,
	rowSegments,
	scrollTargetRow,
	step,
} from "./layout";

const WARSAW = "Europe/Warsaw";
const cols = (dates: string[], start: string, end: string): Column[] =>
	generateColumns({ dates, window: { start, end }, zone: WARSAW });

const allIn = (grid: (number | null)[][]) => grid.flat().filter((s): s is number => s !== null);

describe("alignRows", () => {
	it("keeps a plain rectangle rectangular", () => {
		const c = cols(["2026-11-10", "2026-11-11"], "09:00", "17:00");
		const { rowCount, grid } = alignRows(c, WARSAW);
		expect(rowCount).toBe(16);
		expect(grid.every((col) => col.every((s) => s !== null))).toBe(true);
	});

	it("spring-forward day: gaps at the missing wall times, nothing dropped", () => {
		const c = cols(["2027-03-27", "2027-03-28", "2027-03-29"], "00:00", "00:00");
		expect(c.map((x) => x.slots.length)).toEqual([48, 46, 48]);
		const { rowCount, grid } = alignRows(c, WARSAW);
		expect(rowCount).toBe(48);
		const gaps = grid[1]!.map((s, i) => (s === null ? i : -1)).filter((i) => i >= 0);
		expect(gaps).toEqual([4, 5]); // 02:00 and 02:30 don't exist
		expect(allIn(grid).sort()).toEqual(c.flatMap((x) => x.slots).sort());
	});

	it("fall-back day: extra rows in time order, gaps in the other columns", () => {
		const c = cols(["2027-10-30", "2027-10-31"], "00:00", "00:00");
		expect(c.map((x) => x.slots.length)).toEqual([48, 50]);
		const { rowCount, grid } = alignRows(c, WARSAW);
		expect(rowCount).toBe(50);
		expect(grid[1]!.every((s) => s !== null)).toBe(true);
		// The long column stays in ascending order.
		const long = grid[1] as number[];
		expect([...long].sort((a, b) => a - b)).toEqual(long);
		// The short column has exactly two gaps, right after its own 02:30.
		const gaps = grid[0]!.map((s, i) => (s === null ? i : -1)).filter((i) => i >= 0);
		expect(gaps).toEqual([6, 7]);
		expect(allIn(grid).length).toBe(98);
	});

	it("window starting inside the spring-forward gap still aligns by wall time", () => {
		const c = cols(["2027-03-27", "2027-03-28"], "02:00", "05:00");
		expect(c.map((x) => x.slots.length)).toEqual([6, 4]);
		const { rowCount, grid } = alignRows(c, WARSAW);
		expect(rowCount).toBe(6);
		expect(grid[1]!.slice(0, 2)).toEqual([null, null]);
	});

	it("midnight-crossing window keeps time order", () => {
		const c = cols(["2026-11-10", "2026-11-12"], "20:00", "02:00");
		const { rowCount, grid } = alignRows(c, WARSAW);
		expect(rowCount).toBe(12);
		expect(grid[0]).toEqual(c[0]!.slots);
	});
});

describe("buildGridModel", () => {
	it("Bogotá viewer of a Warsaw 24 h day: header is the previous day, +1 after midnight", () => {
		const m = buildGridModel(cols(["2026-11-10"], "00:00", "00:00"), "America/Bogota", WARSAW);
		expect(m.columns[0]!.headerDate).toBe("2026-11-09");
		expect(`${m.columns[0]!.weekday} ${m.columns[0]!.dayMonth}`).toBe("Mon 9 Nov");
		expect(m.rowLabels[0]!.time).toBe("18:00");
		expect(m.rowLabels[0]!.dayOffset).toBe(0);
		expect(m.rowLabels[12]!.time).toBe("00:00");
		expect(m.rowLabels[12]!.dayOffset).toBe(1);
		expect(m.perColumnLabels).toBe(false);
	});

	it("Manila viewer of a Warsaw midnight-crossing window", () => {
		const m = buildGridModel(cols(["2026-11-10"], "20:00", "02:00"), "Asia/Manila", WARSAW);
		expect(m.columns[0]!.headerDate).toBe("2026-11-11");
		expect(m.rowLabels.map((l) => l!.time)).toContain("03:00");
		expect(m.rowLabels.every((l) => l!.dayOffset === 0)).toBe(true);
	});

	it("Warsaw viewer sees +1 after the creator's midnight", () => {
		const m = buildGridModel(cols(["2026-11-10"], "20:00", "02:00"), WARSAW, WARSAW);
		expect(m.rowLabels[8]!.time).toBe("00:00");
		expect(m.rowLabels[8]!.dayOffset).toBe(1);
	});

	it("DST inside the event: per-column labels for a Bogotá viewer, not for a Warsaw viewer", () => {
		const c = cols(["2027-03-27", "2027-03-28", "2027-03-29"], "09:00", "17:00");
		const bogota = buildGridModel(c, "America/Bogota", WARSAW);
		expect(bogota.perColumnLabels).toBe(true);
		expect(bogota.shiftAt.length).toBeGreaterThan(0);
		expect(cellAt(bogota, 0, 0)!.time).toBe("03:00");
		expect(cellAt(bogota, 2, 0)!.time).toBe("02:00");
		const warsaw = buildGridModel(c, WARSAW, WARSAW);
		expect(warsaw.perColumnLabels).toBe(false);
	});

	it("marks separators between non-adjacent dates", () => {
		const m = buildGridModel(cols(["2026-11-10", "2026-11-11", "2026-11-13"], "09:00", "10:00"), WARSAW, WARSAW);
		expect(m.columns.map((c) => c.gapBefore)).toEqual([false, false, true]);
	});

	it("cell labels read like 'Tue 10 Nov 15:00–15:30'", () => {
		const m = buildGridModel(cols(["2026-11-10"], "15:00", "16:00"), WARSAW, WARSAW);
		const c = cellAt(m, 0, 0)!;
		expect(`${c.dateLabel} ${c.time}–${c.endTime}`).toBe("Tue 10 Nov 15:00–15:30");
		expect(c.creatorTime).toBe("15:00");
	});
});

describe("night hours and scroll target", () => {
	it("Bogotá: the hidden night run sits mid-column and 08:00 is the scroll target", () => {
		const m = buildGridModel(cols(["2026-11-10", "2026-11-11"], "00:00", "00:00"), "America/Bogota", WARSAW);
		const { segments, visible } = rowSegments(m, true);
		const hidden = segments.filter((s) => s.kind === "hidden");
		expect(hidden).toEqual([{ kind: "hidden", from: 12, to: 25 }]);
		expect(visible.length).toBe(48 - 14);
		const target = scrollTargetRow(m, visible);
		expect(m.rowLabels[target!]!.time).toBe("08:00");
	});

	it("Manila viewer of a daytime Warsaw window: night run at the bottom", () => {
		const m = buildGridModel(cols(["2026-11-10"], "09:00", "18:00"), "Asia/Manila", WARSAW);
		const { segments } = rowSegments(m, true);
		const last = segments[segments.length - 1]!;
		expect(last.kind).toBe("hidden");
	});

	it("Kathmandu (+5:45) still finds a morning row", () => {
		const m = buildGridModel(cols(["2026-11-10"], "00:00", "00:00"), "Asia/Kathmandu", WARSAW);
		const { visible } = rowSegments(m, false);
		const target = scrollTargetRow(m, visible);
		expect(["07:45", "08:15"]).toContain(m.rowLabels[target!]!.time);
	});

	it("never hides every row", () => {
		const m = buildGridModel(cols(["2026-11-10"], "02:00", "04:00"), WARSAW, WARSAW);
		expect(rowSegments(m, true).visible.length).toBe(4);
	});
});

describe("navigation and highlight", () => {
	it("steps over gaps and hidden rows", () => {
		const m = buildGridModel(cols(["2027-03-27", "2027-03-28"], "00:00", "00:00"), WARSAW, WARSAW);
		const { visible } = rowSegments(m, false);
		expect(step(m, visible, { col: 1, row: 3 }, "down")).toEqual({ col: 1, row: 6 });
		expect(step(m, visible, { col: 0, row: 4 }, "right")).toBeNull();
		expect(step(m, visible, { col: 0, row: 0 }, "up")).toBeNull();
	});

	it("outlines a range that crosses into the next column on consecutive 24 h days", () => {
		const c = cols(["2026-11-10", "2026-11-11"], "00:00", "00:00");
		const lastOfFirst = c[0]!.slots.at(-1)!;
		const edges = highlightEdges(buildGridModel(c, WARSAW, WARSAW), { start: lastOfFirst, end: lastOfFirst + 60 });
		expect(edges.get(lastOfFirst)).toEqual({ top: true, bottom: true });
		expect(edges.get(lastOfFirst + 30)).toEqual({ top: true, bottom: true });
	});
});

describe("dates", () => {
	it("formats and diffs ISO dates", () => {
		expect(formatIsoDate("2026-11-10").full).toBe("Tue 10 Nov");
		expect(daysBetween("2026-11-10", "2026-11-13")).toBe(3);
		expect(daysBetween("2027-03-27", "2027-03-29")).toBe(2);
	});
});
