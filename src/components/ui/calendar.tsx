// Multi-select month calendar for picking individual event dates (ADR 0001: non-consecutive
// dates are fine). Pure calendar arithmetic on "YYYY-MM-DD" strings; no time zones involved.
// Hand-written because shadcn's calendar needs react-day-picker, a new dependency.
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IsoDate = string;

const pad = (n: number) => String(n).padStart(2, "0");
export const toIso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
export function parseIso(iso: IsoDate): { y: number; m0: number; d: number } {
	const [y, m, d] = iso.split("-").map(Number);
	return { y: y ?? 1970, m0: (m ?? 1) - 1, d: d ?? 1 };
}
export function addDays(iso: IsoDate, n: number): IsoDate {
	const { y, m0, d } = parseIso(iso);
	const t = new Date(Date.UTC(y, m0, d + n));
	return toIso(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

export interface CalendarProps {
	selected: readonly IsoDate[];
	onChange: (dates: IsoDate[]) => void;
	/** Dates before this are disabled. */
	min?: IsoDate;
	/** Dates after this are disabled. */
	max?: IsoDate;
	/** Most dates that can be selected. */
	maxSelected?: number;
	/** 0 = Sunday, 1 = Monday. */
	weekStartsOn?: 0 | 1;
	className?: string;
	"aria-labelledby"?: string;
}

const monthFmt = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const wdFmt = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });

export function Calendar({
	selected,
	onChange,
	min,
	max,
	maxSelected = 31,
	weekStartsOn = 1,
	className,
	...aria
}: CalendarProps) {
	const initial = selected[0] ?? min ?? toIso(new Date().getFullYear(), new Date().getMonth(), 1);
	const [view, setView] = useState(() => {
		const { y, m0 } = parseIso(initial);
		return { y, m0 };
	});
	const [focusDate, setFocusDate] = useState<IsoDate>(initial);
	const gridRef = useRef<HTMLDivElement>(null);
	const selectedSet = useMemo(() => new Set(selected), [selected]);

	const days = useMemo(() => {
		const first = new Date(Date.UTC(view.y, view.m0, 1));
		const lead = (first.getUTCDay() - weekStartsOn + 7) % 7;
		const count = new Date(Date.UTC(view.y, view.m0 + 1, 0)).getUTCDate();
		const cells: (IsoDate | null)[] = Array.from({ length: lead }, () => null);
		for (let d = 1; d <= count; d++) cells.push(toIso(view.y, view.m0, d));
		while (cells.length % 7) cells.push(null);
		return cells;
	}, [view, weekStartsOn]);

	const weekdays = useMemo(
		() => Array.from({ length: 7 }, (_, i) => wdFmt.format(new Date(Date.UTC(2023, 0, 1 + ((i + weekStartsOn) % 7))))),
		[weekStartsOn],
	);

	const disabled = (iso: IsoDate) => (min !== undefined && iso < min) || (max !== undefined && iso > max);

	const toggle = (iso: IsoDate) => {
		if (disabled(iso)) return;
		if (selectedSet.has(iso)) onChange(selected.filter((d) => d !== iso));
		else if (selected.length < maxSelected) onChange([...selected, iso].sort());
	};

	const shiftMonth = (n: number) =>
		setView((v) => {
			const t = new Date(Date.UTC(v.y, v.m0 + n, 1));
			return { y: t.getUTCFullYear(), m0: t.getUTCMonth() };
		});

	const moveFocus = (iso: IsoDate) => {
		const { y, m0 } = parseIso(iso);
		setFocusDate(iso);
		if (y !== view.y || m0 !== view.m0) setView({ y, m0 });
		requestAnimationFrame(() => {
			gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${iso}"]`)?.focus();
		});
	};

	const onKeyDown = (e: React.KeyboardEvent, iso: IsoDate) => {
		const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
		const n = delta[e.key];
		if (n !== undefined) {
			e.preventDefault();
			moveFocus(addDays(iso, n));
		}
	};

	const inView = (iso: IsoDate) => {
		const { y, m0 } = parseIso(iso);
		return y === view.y && m0 === view.m0;
	};
	const tabTarget = inView(focusDate) ? focusDate : (days.find((d) => d !== null && !disabled(d)) ?? null);
	const prevDisabled = min !== undefined && toIso(view.y, view.m0, 1) <= min;

	return (
		<div className={cn("w-full select-none", className)}>
			<div className="mb-2 flex items-center justify-between">
				<button
					type="button"
					onClick={() => shiftMonth(-1)}
					disabled={prevDisabled}
					aria-label="Previous month"
					className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
				>
					<ChevronLeftIcon />
				</button>
				<div className="text-sm font-semibold" aria-live="polite">
					{monthFmt.format(new Date(Date.UTC(view.y, view.m0, 1)))}
				</div>
				<button
					type="button"
					onClick={() => shiftMonth(1)}
					aria-label="Next month"
					className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
				>
					<ChevronRightIcon />
				</button>
			</div>
			<div className="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden>
				{weekdays.map((w) => (
					<div key={w} className="py-1">
						{w.slice(0, 2)}
					</div>
				))}
			</div>
			<div ref={gridRef} role="group" className="grid grid-cols-7 gap-0.5 sm:gap-1" {...aria}>
				{days.map((iso, i) => {
					if (!iso) return <div key={`e${i}`} />;
					const on = selectedSet.has(iso);
					const off = disabled(iso);
					return (
						<button
							key={iso}
							type="button"
							data-date={iso}
							aria-pressed={on}
							aria-label={dayFmt.format(new Date(`${iso}T00:00:00Z`))}
							disabled={off}
							tabIndex={iso === tabTarget ? 0 : -1}
							onClick={() => {
								setFocusDate(iso);
								toggle(iso);
							}}
							onKeyDown={(e) => onKeyDown(e, iso)}
							className={cn(
								"aspect-square w-full min-w-0 rounded-md sm:aspect-auto sm:h-10 text-sm tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
								on
									? "bg-primary font-semibold text-primary-foreground hover:bg-brand-800"
									: "hover:bg-accent hover:text-accent-foreground",
								off && "pointer-events-none text-muted-foreground/50 line-through decoration-transparent",
							)}
						>
							{parseIso(iso).d}
						</button>
					);
				})}
			</div>
		</div>
	);
}
