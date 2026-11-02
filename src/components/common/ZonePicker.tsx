// Searchable IANA time-zone combobox: Popover + input + listbox (cmdk would be a new dependency).
import { CheckIcon, ChevronsUpDownIcon, GlobeIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { allZones, browserZone, offsetLabel, zoneCity, zoneLongName, zoneOffsetMinutes, zoneRegion } from "@/lib/zones";
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
			return {
				zone,
				city,
				region: zoneRegion(zone),
				offset,
				haystack: `${zone} ${city} ${long} ${off} ${off.replace("−", "-")}`
					.toLowerCase()
					.normalize("NFD")
					.replace(/[̀-ͯ]/g, ""),
			};
		});
	}
	return optionsCache;
}

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

	const results = useMemo(() => {
		if (!open) return [];
		const opts = zoneOptions();
		const q = fold(query);
		if (!q) {
			const sugg = [...new Set([...suggested, browserZone()])]
				.map((z) => opts.find((o) => o.zone === z))
				.filter((o): o is ZoneOption => !!o);
			const rest = opts.filter((o) => !sugg.includes(o)).sort((a, b) => a.offset - b.offset || a.city.localeCompare(b.city));
			return [...sugg, ...rest];
		}
		const terms = q.split(/\s+/);
		return opts
			.filter((o) => terms.every((t) => o.haystack.includes(t)))
			.sort((a, b) => {
				const ac = fold(a.city).startsWith(q) ? 0 : 1;
				const bc = fold(b.city).startsWith(q) ? 0 : 1;
				return ac - bc || a.offset - b.offset || a.city.localeCompare(b.city);
			});
	}, [open, query, suggested]);

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
							{zoneCity(value)} ({nowOffset})
							<ChevronsUpDownIcon className="size-3.5 opacity-70" />
						</>
					) : (
						<>
							<span className="flex min-w-0 items-center gap-2">
								<GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
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
						<li
							key={o.zone}
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
							<span className="min-w-0 flex-1 truncate">
								{o.city}
								{o.region && <span className="text-muted-foreground"> · {o.region}</span>}
							</span>
							<span className="shrink-0 text-xs text-muted-foreground tabular-nums">{offsetLabel(o.offset)}</span>
						</li>
					))}
					{results.length > visible.length && (
						<li className="px-2 py-2 text-center text-xs text-muted-foreground">Keep typing to narrow down…</li>
					)}
				</ul>
			</PopoverContent>
		</Popover>
	);
}
