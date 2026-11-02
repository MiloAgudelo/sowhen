// Dev-only playground for the grid (agent D may mount it at /__grid in dev).
// Fixtures: Warsaw creator; viewer switchable; 24 h, midnight-crossing, DST and 31-day events.
import { useMemo, useState } from "react";
import {
	formatUtcOffset,
	generateColumns,
	offsetMinutes,
	offsetShifts,
	rankBestTimes,
	slotToZoned,
	tallySlots,
} from "@/domain";
import type { Column, DailyWindow, ResponseDto, SlotId, ZoneId } from "@/shared/types";
import { type Brush, BrushPicker, Grid, GridLegend, type Selection } from "./Grid";
import { formatIsoDate, zoneCity } from "./layout";

const CREATOR: ZoneId = "Europe/Warsaw";
const VIEWERS: ZoneId[] = ["America/Bogota", "Asia/Manila", "Asia/Kathmandu", "Europe/Warsaw"];

interface Fixture {
	id: string;
	name: string;
	dates: string[];
	window: DailyWindow;
}

const days = (from: string, n: number) => {
	const [y, m, d] = from.split("-").map(Number);
	return Array.from({ length: n }, (_, i) =>
		new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + i)).toISOString().slice(0, 10),
	);
};

const FIXTURES: Fixture[] = [
	{
		id: "24h",
		name: "24 h, Tue 10 / Wed 11 / Fri 13 Nov 2026",
		dates: ["2026-11-10", "2026-11-11", "2026-11-13"],
		window: { start: "00:00", end: "00:00" },
	},
	{
		id: "midnight",
		name: "20:00–02:00 Warsaw, 10–14 Nov 2026",
		dates: days("2026-11-10", 5),
		window: { start: "20:00", end: "02:00" },
	},
	{
		id: "dst-spring",
		name: "24 h across EU spring-forward (26–30 Mar 2027)",
		dates: days("2027-03-26", 5),
		window: { start: "00:00", end: "00:00" },
	},
	{
		id: "dst-fall",
		name: "00:00–06:00 across EU fall-back (29 Oct–2 Nov 2027)",
		dates: days("2027-10-29", 5),
		window: { start: "00:00", end: "06:00" },
	},
	{
		id: "big",
		name: "31 days × 24 h (performance)",
		dates: days("2026-12-01", 31),
		window: { start: "00:00", end: "00:00" },
	},
];

const NAMES = ["Ana", "Kenji", "Marta", "Tomasz", "Lucía", "Priya", "Bayani", "Sita"];

/** Deterministic pseudo-random responses, so the heatmap looks the same on every reload. */
function fakeResponses(columns: Column[]): ResponseDto[] {
	let seed = 42;
	const rand = () => {
		seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
		return seed / 2 ** 31;
	};
	return NAMES.map((name, i) => {
		const available: SlotId[] = [];
		const ifNeeded: SlotId[] = [];
		for (const col of columns) {
			col.slots.forEach((slot, j) => {
				// Each person has a preferred band of the day, shifted per person.
				const band = (j + i * 5) % col.slots.length < col.slots.length / 2;
				const r = rand();
				if (band && r < 0.75) available.push(slot);
				else if (r < 0.15) ifNeeded.push(slot);
			});
		}
		return { name, nameKey: name.toLowerCase(), available, ifNeeded, updatedAt: "2026-11-01T00:00:00Z" };
	});
}

export function GridDemo() {
	const [fixtureId, setFixtureId] = useState(FIXTURES[0]!.id);
	const [viewer, setViewer] = useState<ZoneId>(VIEWERS[0]!);
	const [mode, setMode] = useState<"paint" | "view">("paint");
	const [brush, setBrush] = useState<Brush>("available");
	const [value, setValue] = useState<Selection>({ available: new Set(), ifNeeded: new Set() });
	const [focused, setFocused] = useState<SlotId | null>(null);
	const [strokes, setStrokes] = useState(0);

	const fixture = FIXTURES.find((f) => f.id === fixtureId) ?? FIXTURES[0]!;
	const columns = useMemo(
		() => generateColumns({ dates: fixture.dates, window: fixture.window, zone: CREATOR }),
		[fixture],
	);
	const responses = useMemo(() => fakeResponses(columns), [columns]);
	const tallies = useMemo(() => tallySlots(columns.flatMap((c) => c.slots), responses), [columns, responses]);
	const best = useMemo(() => rankBestTimes(columns, responses, 60, 1)[0] ?? null, [columns, responses]);
	const shift = useMemo(() => offsetShifts(columns, viewer, CREATOR), [columns, viewer]);

	const firstShift = shift.at[0];
	let notice: string | undefined;
	if (shift.shifts && firstShift !== undefined) {
		const diff = (at: SlotId) => offsetMinutes(viewer, at) - offsetMinutes(CREATOR, at);
		const delta = Math.abs(diff(firstShift) - diff(firstShift - 30)) / 60;
		const day = formatIsoDate(slotToZoned(firstShift, viewer).toPlainDate().toString()).dayMonth;
		notice = `Your local times shift by ${delta}h from ${day}.`;
	}

	const tally = focused === null ? undefined : tallies.get(focused);
	const firstSlot = columns[0]?.slots[0];

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
			<h1 className="text-2xl font-semibold text-primary">Grid playground</h1>
			<div className="flex flex-wrap items-end gap-4 text-sm">
				<label className="flex flex-col gap-1">
					Event
					<select className="rounded border px-2 py-1" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
						{FIXTURES.map((f) => (
							<option key={f.id} value={f.id}>
								{f.name}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-1">
					Viewer zone
					<select className="rounded border px-2 py-1" value={viewer} onChange={(e) => setViewer(e.target.value)}>
						{VIEWERS.map((z) => (
							<option key={z} value={z}>
								{zoneCity(z)}
								{firstSlot !== undefined ? ` (${formatUtcOffset(z, firstSlot)})` : ""}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-1">
					Mode
					<select
						className="rounded border px-2 py-1"
						value={mode}
						onChange={(e) => setMode(e.target.value as "paint" | "view")}
					>
						<option value="paint">Paint (my response)</option>
						<option value="view">View (heatmap)</option>
					</select>
				</label>
				{mode === "paint" && <BrushPicker value={brush} onChange={setBrush} />}
			</div>

			<p className="text-sm text-muted-foreground">
				Times in {zoneCity(viewer)}. Created in {zoneCity(CREATOR)}. Columns:{" "}
				{columns.map((c) => c.slots.length).join(" / ")} slots.
				{mode === "paint" && ` Strokes: ${strokes}. Painted: ${value.available.size} available, ${value.ifNeeded.size} if needed.`}
			</p>

			<GridLegend mode={mode} respondentCount={responses.length} />

			<Grid
				columns={columns}
				viewerZone={viewer}
				creatorZone={CREATOR}
				mode={mode}
				value={value}
				brush={brush}
				onChange={(next) => {
					setValue(next);
					setStrokes((n) => n + 1);
				}}
				tallies={tallies}
				respondentCount={responses.length}
				highlight={mode === "view" && best ? { start: best.start, end: best.end } : null}
				onSlotFocus={setFocused}
				label={`Demo: ${fixture.name}`}
				notice={notice}
			/>

			{mode === "view" && (
				<div className="min-h-16 rounded-md border p-3 text-sm" aria-live="polite">
					{tally ? (
						<>
							<div>Available: {tally.available.join(", ") || "—"}</div>
							<div>If needed: {tally.ifNeeded.join(", ") || "—"}</div>
							<div>Missing: {tally.missing.join(", ") || "—"}</div>
						</>
					) : (
						<span className="text-muted-foreground">Hover, tap or focus a slot to see who's free.</span>
					)}
				</div>
			)}
		</div>
	);
}

export default GridDemo;
