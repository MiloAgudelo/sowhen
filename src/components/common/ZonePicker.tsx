// Searchable IANA time-zone combobox: Popover + input + listbox (cmdk would be a new dependency).
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { ZoneFlag } from "@/components/common/ZoneFlag";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
	allZones,
	canonicalZone,
	browserZone,
	offsetLabel,
	zoneCity,
	zoneCountryName,
	zoneLongName,
	zoneOffsetMinutes,
	zoneRegion,
} from "@/lib/zones";
import type { ZoneId } from "@/shared/types";

interface ZoneOption {
	zone: ZoneId;
	city: string;
	region: string;
	offset: number;
	haystack: string;
}

let optionsCache: ZoneOption[] | null = null;
function zoneOptions(): ZoneOption[] {
	if (!optionsCache) {
		const now = new Date();
		optionsCache = allZones().map((zone) => {
			const city = zoneCity(zone);
			const offset = zoneOffsetMinutes(zone, now);
			const long = zoneLongName(zone, now);
			const off = offsetLabel(offset);
			const country = zoneCountryName(zone);
			return {
				zone,
				city,
				region: zoneRegion(zone),
				offset,
				haystack: `${zone} ${city} ${country} ${long} ${off} ${off.replace("−", "-")}`
					.toLowerCase()
					.normalize("NFD")
					.replace(/[̀-ͯ]/g, ""),
			};
		});
	}
	return optionsCache;
}

/**
 * Zones the WSJ 2027 team uses most, listed before all others when the search is empty. Edit freely:
 * any IANA name works (aliases are canonicalised).
 */
export const COMMON_ZONES: readonly ZoneId[] = [
	"America/Bogota",
	"Europe/London",
	"Europe/Warsaw",
	"Australia/Sydney",
	"Pacific/Auckland",
];

const fold = (s: string) =>
	s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.trim();

export interface ZonePickerProps {
	value: ZoneId;
	onChange: (zone: ZoneId) => void;
	id?: string;
	className?: string;
	/** Zones to list first (e.g. the browser's and the creator's). */
	suggested?: ZoneId[];
	/** Render the trigger as compact inline text instead of a full-width field. */
	compact?: boolean;
	/** Instant whose UTC offset the trigger shows (e.g. the event's first slot). Default: now. */
	offsetAt?: Date;
	"aria-label"?: string;
	"aria-describedby"?: string;
}

export function ZonePicker({
	value,
	onChange,
	id,
	className,
	suggested = [],
	compact = false,
	offsetAt,
	...aria
}: ZonePickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const listId = useId();
	const listRef = useRef<HTMLUListElement>(null);

	// With an empty search: your zones (suggested, e.g. the creator's; browser; selected), then the team's common zones by
	// offset, then a divider and every other zone. `topCount` is where the divider goes.
	const { results, topCount } = useMemo(() => {
		if (!open) return { results: [], topCount: 0 };
		const opts = zoneOptions();
		const byZone = new Map(opts.map((o) => [o.zone, o]));
		const pick = (zones: ZoneId[]) =>
			zones.map((z) => byZone.get(canonicalZone(z))).filter((o): o is ZoneOption => !!o);
		const byOffset = (a: ZoneOption, b: ZoneOption) => a.offset - b.offset || a.city.localeCompare(b.city);
		const q = fold(query);
		if (!q) {
			const mine = [...new Set(pick([...suggested, browserZone(), value]))];
			const common = pick([...COMMON_ZONES]).filter((o) => !mine.includes(o)).sort(byOffset);
			const top = [...mine, ...new Set(common)];
			const rest = opts.filter((o) => !top.includes(o)).sort(byOffset);
			return { results: [...top, ...rest], topCount: top.length };
		}
		const terms = q.split(/\s+/);
		const found = opts
			.filter((o) => terms.every((t) => o.haystack.includes(t)))
			.sort((a, b) => {
				const ac = fold(a.city).startsWith(q) ? 0 : 1;
				const bc = fold(b.city).startsWith(q) ? 0 : 1;
				return ac - bc || byOffset(a, b);
			});
		return { results: found, topCount: 0 };
	}, [open, query, suggested, value]);

	const visible = results.slice(0, 80);

	useEffect(() => {
		setActive(0);
	}, [query, open]);

	useEffect(() => {
		listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const choose = (zone: ZoneId) => {
		onChange(zone);
		setOpen(false);
		setQuery("");
	};

	const nowOffset = offsetLabel(zoneOffsetMinutes(value, offsetAt));

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					id={id}
					type="button"
					role="combobox"
					aria-expanded={open}
					aria-controls={listId}
					aria-haspopup="listbox"
					{...aria}
					className={cn(
						compact
							? "inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
							: "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
						className,
					)}
				>
					{compact ? (
						<>
							<ZoneFlag zone={value} className="mr-0.5" />
							{zoneCity(value)} ({nowOffset})
							<ChevronsUpDownIcon className="size-3.5 opacity-70" />
						</>
					) : (
						<>
							<span className="flex min-w-0 items-center gap-2">
								<ZoneFlag zone={value} />
								<span className="truncate">
									{zoneCity(value)} <span className="text-muted-foreground">· {nowOffset}</span>
								</span>
							</span>
							<ChevronsUpDownIcon className="size-4 shrink-0 opacity-60" />
						</>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
				<div className="border-b p-2">
					<input
						autoFocus
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search city or zone…"
						aria-label="Search time zones"
						aria-controls={listId}
						aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
						role="combobox"
						aria-expanded
						aria-autocomplete="list"
						onKeyDown={(e) => {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setActive((a) => Math.min(a + 1, visible.length - 1));
							} else if (e.key === "ArrowUp") {
								e.preventDefault();
								setActive((a) => Math.max(a - 1, 0));
							} else if (e.key === "Enter") {
								e.preventDefault();
								const o = visible[active];
								if (o) choose(o.zone);
							}
						}}
						className="h-9 w-full rounded-md bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
					/>
				</div>
				<ul ref={listRef} id={listId} role="listbox" aria-label="Time zones" className="max-h-72 overflow-y-auto p-1">
					{visible.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">No zone found.</li>}
					{visible.map((o, i) => (
						<Fragment key={o.zone}>
							{i === topCount && topCount > 0 && (
								<li role="presentation" className="mx-2 mt-2 mb-1 border-t pt-2 text-xs font-medium text-muted-foreground">
									All time zones
								</li>
							)}
							<li
								id={`${listId}-${i}`}
								data-index={i}
								role="option"
								aria-selected={o.zone === value}
								onPointerMove={() => setActive(i)}
								onClick={() => choose(o.zone)}
								className={cn(
									"flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm",
									i === active && "bg-accent text-accent-foreground",
								)}
							>
								<CheckIcon className={cn("size-4 shrink-0", o.zone === value ? "opacity-100" : "opacity-0")} />
								<ZoneFlag zone={o.zone} />
								<span className="min-w-0 flex-1 truncate">
									{o.city}
									{o.region && <span className="text-muted-foreground"> · {o.region}</span>}
								</span>
								<span className="shrink-0 text-xs text-muted-foreground tabular-nums">{offsetLabel(o.offset)}</span>
							</li>
						</Fragment>
					))}
					{results.length > visible.length && (
						<li className="px-2 py-2 text-center text-xs text-muted-foreground">Keep typing to narrow down…</li>
					)}
				</ul>
			</PopoverContent>
		</Popover>
	);
}
