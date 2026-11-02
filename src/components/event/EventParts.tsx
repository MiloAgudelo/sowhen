import { CalendarClockIcon, InfoIcon, UsersIcon } from "lucide-react";
import { ZonePicker } from "@/components/common/ZonePicker";
import { cn } from "@/lib/utils";
import { formatDay, formatRange, formatTime, zoneCity } from "@/lib/zones";
import type { SlotTally } from "@/domain";
import { formatUtcOffset } from "@/domain";
import type { BestTime, SlotId, ZoneId } from "@/shared/types";

// ---- Viewer zone indicator + switcher (ADR 0003)

export function ZoneBar({
	viewerZone,
	creatorZone,
	onChange,
	at,
}: {
	viewerZone: ZoneId;
	creatorZone: ZoneId;
	onChange: (z: ZoneId) => void;
	/** A slot of the event, so the offset shown is the one that applies during the event. */
	at: SlotId;
}) {
	let off = "";
	try {
		off = formatUtcOffset(viewerZone, at);
	} catch {
		off = "";
	}
	return (
		<div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
			<span className="text-muted-foreground">Times in</span>
			<ZonePicker
				compact
				value={viewerZone}
				onChange={onChange}
				suggested={[creatorZone]}
				aria-label={`Times shown in ${zoneCity(viewerZone)} (${off}). Change time zone`}
			/>
			{viewerZone !== creatorZone && (
				<span className="text-muted-foreground">
					<span aria-hidden className="hidden sm:inline">· </span>
					<span className="sr-only sm:not-sr-only">creator zone: {zoneCity(creatorZone)}</span>
				</span>
			)}
		</div>
	);
}

// ---- Notice (DST shift, info)

export function Notice({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			role="note"
			className={cn(
				"flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-foreground",
				className,
			)}
		>
			<InfoIcon className="mt-0.5 size-4 shrink-0" />
			<div>{children}</div>
		</div>
	);
}

// ---- Best times (ADR 0006)

function names(list: string[], max = 3): string {
	if (list.length <= max) return list.join(", ");
	return `${list.slice(0, max).join(", ")} +${list.length - max}`;
}

export function BestTimesList({
	items,
	viewerZone,
	creatorZone,
	total,
	selected,
	onSelect,
}: {
	items: BestTime[];
	viewerZone: ZoneId;
	creatorZone: ZoneId;
	total: number;
	selected: BestTime | null;
	onSelect: (b: BestTime | null) => void;
}) {
	if (total === 0)
		return <p className="text-sm text-muted-foreground">No responses yet. Share the link and check back.</p>;
	if (items.length === 0)
		return (
			<p className="text-sm text-muted-foreground">
				No time works for anyone at this length yet. Try a shorter meeting length.
			</p>
		);
	const showCreator = zoneCity(viewerZone) !== zoneCity(creatorZone);
	return (
		<ol className="grid gap-2">
			{items.map((b, i) => {
				const isSel = selected?.start === b.start && selected?.end === b.end;
				const label = `${formatDay(b.start, viewerZone)} ${formatRange(b.start, b.end, viewerZone)}`;
				return (
					<li key={`${b.start}-${b.end}`}>
						<button
							type="button"
							aria-pressed={isSel}
							onClick={() => onSelect(isSel ? null : b)}
							className={cn(
								"group grid w-full gap-1 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
								isSel && "border-primary bg-brand-50 ring-1 ring-primary",
							)}
						>
							<span className="flex flex-wrap items-baseline gap-x-2">
								<span className="text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}.</span>
								<span className="font-semibold tabular-nums">{label}</span>
								{showCreator && (
									<span className="text-sm text-muted-foreground tabular-nums">
										({zoneCity(creatorZone)} {formatRange(b.start, b.end, creatorZone)})
									</span>
								)}
							</span>
							<span className="flex flex-wrap gap-x-2 text-sm">
								<span className="font-medium text-primary">
									{b.available.length} of {total}
								</span>
								{b.ifNeeded.length > 0 && (
									<span className="text-muted-foreground">· if needed: {names(b.ifNeeded)}</span>
								)}
								{b.missing.length > 0 && (
									<span className="text-muted-foreground">· missing: {names(b.missing)}</span>
								)}
							</span>
						</button>
					</li>
				);
			})}
		</ol>
	);
}

// ---- Slot detail (ADR 0006)

export function SlotDetail({
	slot,
	tally,
	viewerZone,
	creatorZone,
}: {
	slot: SlotId | null;
	tally: SlotTally | undefined;
	viewerZone: ZoneId;
	creatorZone: ZoneId;
}) {
	if (slot === null || !tally)
		return (
			<p className="flex items-center gap-2 text-sm text-muted-foreground">
				<CalendarClockIcon className="size-4" />
				Tap or hover a slot to see who's free.
			</p>
		);
	const showCreator = zoneCity(viewerZone) !== zoneCity(creatorZone);
	return (
		<div className="grid gap-3" aria-live="polite">
			<p className="font-semibold tabular-nums">
				{formatDay(slot, viewerZone)} · {formatRange(slot, slot + 30, viewerZone)}
				{showCreator && (
					<span className="ml-1 font-normal text-muted-foreground">
						({zoneCity(creatorZone)} {formatTime(slot, creatorZone)})
					</span>
				)}
			</p>
			<NameGroup label="Available" names={tally.available} tone="strong" />
			<NameGroup label="If needed" names={tally.ifNeeded} tone="soft" />
			<NameGroup label="Missing" names={tally.missing} tone="none" />
		</div>
	);
}

function NameGroup({ label, names, tone }: { label: string; names: string[]; tone: "strong" | "soft" | "none" }) {
	return (
		<div className="grid gap-1">
			<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{label} · {names.length}
			</p>
			{names.length === 0 ? (
				<p className="text-sm text-muted-foreground">Nobody</p>
			) : (
				<ul className="flex flex-wrap gap-1">
					{names.map((n) => (
						<li
							key={n}
							className={cn(
								"rounded-full px-2.5 py-0.5 text-sm",
								tone === "strong" && "bg-primary text-primary-foreground",
								tone === "soft" &&
									"border border-dashed border-brand-400 bg-brand-50 text-secondary-foreground",
								tone === "none" && "bg-muted text-muted-foreground",
							)}
						>
							{n}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export function Respondents({ names: list }: { names: string[] }) {
	if (list.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-1.5 text-sm">
			<UsersIcon className="size-4 text-muted-foreground" aria-hidden />
			<span className="sr-only">Responses:</span>
			{list.map((n) => (
				<span key={n} className="rounded-full bg-secondary px-2.5 py-0.5 text-secondary-foreground">
					{n}
				</span>
			))}
		</div>
	);
}
