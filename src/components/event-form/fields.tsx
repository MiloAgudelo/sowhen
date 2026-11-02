// Form fields shared by the create page and the admin page.
import { XIcon } from "lucide-react";
import { useId, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { generateColumns } from "@/domain";
import { cn } from "@/lib/utils";
import { browserZone, formatIsoDate, formatRange, zoneCity } from "@/lib/zones";
import { type DailyWindow, type IsoDate, MEETING_DURATIONS, type MeetingDuration, type ZoneId } from "@/shared/types";

export const MAX_DATES = 31;

// ---- Dates

export function DatesField({
	value,
	onChange,
	min,
	error,
}: {
	value: IsoDate[];
	onChange: (d: IsoDate[]) => void;
	min?: IsoDate;
	error?: string | null;
}) {
	const labelId = useId();
	return (
		<fieldset className="grid gap-3">
			<legend id={labelId} className="mb-1 text-sm font-medium">
				Dates
			</legend>
			<p className="-mt-1 text-sm text-muted-foreground">Tap every day that could work. They don't have to be in a row.</p>
			<div className="min-w-0 rounded-lg border bg-card p-2 sm:max-w-sm sm:p-3">
				<Calendar selected={value} onChange={onChange} min={min} maxSelected={MAX_DATES} aria-labelledby={labelId} />
			</div>
			{value.length > 0 ? (
				<ul className="flex flex-wrap gap-1.5" aria-label="Chosen dates">
					{value.map((d) => (
						<li key={d}>
							<button
								type="button"
								onClick={() => onChange(value.filter((x) => x !== d))}
								className="inline-flex h-8 items-center gap-1 rounded-full bg-secondary pr-2 pl-3 text-sm text-secondary-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
								aria-label={`Remove ${formatIsoDate(d, { year: true })}`}
							>
								{formatIsoDate(d)}
								<XIcon className="size-3.5" />
							</button>
						</li>
					))}
				</ul>
			) : null}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
		</fieldset>
	);
}

// ---- Daily window

export const TIMES: string[] = Array.from({ length: 48 }, (_, i) => {
	const h = String(Math.floor(i / 2)).padStart(2, "0");
	return `${h}:${i % 2 ? "30" : "00"}`;
});

export function windowMinutes(w: DailyWindow): number {
	const toMin = (t: string) => {
		const [h, m] = t.split(":").map(Number);
		return (h ?? 0) * 60 + (m ?? 0);
	};
	const a = toMin(w.start);
	const b = toMin(w.end);
	if (a === b) return 24 * 60;
	return b > a ? b - a : 24 * 60 - (a - b);
}

const PRESETS: { label: string; window: DailyWindow }[] = [
	{ label: "Work hours", window: { start: "09:00", end: "17:00" } },
	{ label: "Daytime", window: { start: "07:00", end: "22:00" } },
	{ label: "Evenings", window: { start: "17:00", end: "23:00" } },
	{ label: "All day (24 h)", window: { start: "00:00", end: "00:00" } },
];

function formatHours(min: number) {
	const h = min / 60;
	return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

export function WindowField({
	value,
	onChange,
	creatorZone,
	previewDate,
}: {
	value: DailyWindow;
	onChange: (w: DailyWindow) => void;
	creatorZone: ZoneId;
	previewDate: IsoDate;
}) {
	const startId = useId();
	const endId = useId();
	const helpId = useId();
	const length = windowMinutes(value);
	const crosses = value.end < value.start && value.end !== value.start;
	const allDay = value.start === value.end;
	const presetKey = PRESETS.find((p) => p.window.start === value.start && p.window.end === value.end)?.label ?? "";

	return (
		<fieldset className="grid gap-3" aria-describedby={helpId}>
			<legend className="mb-1 text-sm font-medium">Daily time window</legend>
			<p id={helpId} className="-mt-1 text-sm text-muted-foreground">
				People can only mark times inside this window, so make it wide if your group is spread out.{" "}
				<span className="text-foreground">Times are in {zoneCity(creatorZone)} time.</span>
			</p>
			<ToggleGroup
				type="single"
				variant="outline"
				value={presetKey}
				onValueChange={(label) => {
					const p = PRESETS.find((x) => x.label === label);
					if (p) onChange(p.window);
				}}
				className="flex w-full flex-wrap sm:w-fit"
				aria-label="Window presets"
			>
				{PRESETS.map((p) => (
					<ToggleGroupItem key={p.label} value={p.label} className="px-3 text-sm">
						{p.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<div className="flex flex-wrap items-end gap-3">
				<div className="grid gap-1.5">
					<Label htmlFor={startId}>From</Label>
					<Select value={value.start} onValueChange={(start) => onChange({ ...value, start })}>
						<SelectTrigger id={startId} className="w-28 tabular-nums">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="max-h-72">
							{TIMES.map((t) => (
								<SelectItem key={t} value={t} className="tabular-nums">
									{t}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor={endId}>To</Label>
					<Select value={value.end} onValueChange={(end) => onChange({ ...value, end })}>
						<SelectTrigger id={endId} className="w-28 tabular-nums">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="max-h-72">
							{TIMES.map((t) => (
								<SelectItem key={t} value={t} className="tabular-nums">
									{t === value.start ? `${t} (24 h)` : t}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<p className="pb-2.5 text-sm text-muted-foreground">
					{allDay ? "All day, 24 h" : `${formatHours(length)}${crosses ? ", ends the next day" : ""}`}
				</p>
			</div>
			<WindowPreview window={value} creatorZone={creatorZone} date={previewDate} />
		</fieldset>
	);
}

const PREVIEW_ZONES: ZoneId[] = ["America/Bogota", "Europe/Warsaw", "America/New_York", "Asia/Manila", "Europe/London"];

/** "For someone in Bogotá this is 03:00–12:00": goes through generateColumns so DST and midnight are right. */
export function WindowPreview({
	window,
	creatorZone,
	date,
}: {
	window: DailyWindow;
	creatorZone: ZoneId;
	date: IsoDate;
}) {
	const lines = useMemo(() => {
		let range: { start: number; end: number } | null = null;
		try {
			const col = generateColumns({ dates: [date], window, zone: creatorZone })[0];
			const first = col?.slots[0];
			const last = col?.slots[col.slots.length - 1];
			if (first !== undefined && last !== undefined) range = { start: first, end: last + 30 };
		} catch {
			range = null;
		}
		if (!range) return [];
		const r = range;
		const zones = [browserZone(), ...PREVIEW_ZONES]
			.filter((z, i, all) => all.indexOf(z) === i)
			.filter((z) => zoneCity(z) !== zoneCity(creatorZone))
			.filter((z) => {
				try {
					return formatRange(r.start, r.end, z) !== formatRange(r.start, r.end, creatorZone);
				} catch {
					return false;
				}
			})
			.map((z) => ({ zone: z, text: formatRange(r.start, r.end, z) }))
			.filter((l, i, all) => all.findIndex((x) => x.text === l.text) === i)
			.slice(0, 2);
		return zones;
	}, [window, creatorZone, date]);

	if (lines.length === 0) return null;
	return (
		<div className="rounded-lg bg-muted px-3 py-2 text-sm" aria-live="polite">
			{lines.map((l, i) => (
				<p key={l.zone} className={cn(i > 0 && "mt-0.5")}>
					For someone in <span className="font-medium">{zoneCity(l.zone)}</span> this is{" "}
					<span className="font-medium tabular-nums">{l.text}</span>
				</p>
			))}
			<p className="mt-0.5 text-xs text-muted-foreground">on {formatIsoDate(date)}</p>
		</div>
	);
}

// ---- Meeting duration

export const DURATION_LABELS: Record<MeetingDuration, string> = { 30: "30 min", 60: "1 h", 90: "1.5 h", 120: "2 h" };

export function DurationField({
	value,
	onChange,
	label = "Meeting duration",
	hint = "Best times only lists ranges at least this long.",
}: {
	value: MeetingDuration;
	onChange: (d: MeetingDuration) => void;
	label?: string;
	hint?: string;
}) {
	const id = useId();
	return (
		<div className="grid gap-2">
			<span id={id} className="text-sm font-medium">
				{label}
			</span>
			<ToggleGroup
				type="single"
				variant="outline"
				value={String(value)}
				onValueChange={(v) => v && onChange(Number(v) as MeetingDuration)}
				aria-labelledby={id}
				className="w-full sm:w-fit"
			>
				{MEETING_DURATIONS.map((d) => (
					<ToggleGroupItem key={d} value={String(d)} className="px-4">
						{DURATION_LABELS[d]}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			{hint && <p className="text-sm text-muted-foreground">{hint}</p>}
		</div>
	);
}
