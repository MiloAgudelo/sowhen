// Contract for the availability grid (ADR 0003, 0006). Implemented by agent C; composed by agent D.
// Props may gain optional fields, but existing fields must not change without telling agent D.
import {
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	memo,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { heat, type SlotTally } from "@/domain";
import { cn } from "@/lib/utils";
import type { Column, SlotId, ZoneId } from "@/shared/types";
import {
	type CellInfo,
	type CellPos,
	type GridModel,
	type Direction,
	buildGridModel,
	cellAt,
	firstCell,
	highlightEdges,
	nightRows,
	rowSegments,
	scrollTargetRow,
	step,
	zoneCity,
} from "./layout";
import { type CellState, applyTarget, nearestIndex, rectSlots, stateOf, strokeTarget } from "./selection";

export type Brush = "available" | "ifNeeded" | "erase";

export interface Selection {
	available: ReadonlySet<SlotId>;
	ifNeeded: ReadonlySet<SlotId>;
}

export interface GridProps {
	columns: Column[];
	viewerZone: ZoneId;
	creatorZone: ZoneId;
	/** "paint": edit your own response. "view": heatmap of everyone. */
	mode: "paint" | "view";

	// paint mode
	value?: Selection;
	brush?: Brush;
	/** Called once per completed stroke (pointer up), not on every cell. */
	onChange?: (next: Selection) => void;

	// view mode
	tallies?: ReadonlyMap<SlotId, SlotTally>;
	respondentCount?: number;
	/** A best-time range to outline, [start, end) in epoch minutes. */
	highlight?: { start: SlotId; end: SlotId } | null;
	/** Hover/tap/keyboard focus on a slot, for the slot-detail panel. null when leaving. */
	onSlotFocus?: (slot: SlotId | null) => void;

	/** Accessible label for the grid, e.g. the event title. */
	label: string;

	// ---- Optional additions (agent C)

	/**
	 * Shown above the grid and linked to it with aria-describedby, e.g. the DST notice
	 * ("Your local times shift by 1h from Sun 28 Mar"). Use `offsetShifts` from `@/domain` to decide.
	 */
	notice?: ReactNode;
	/** Controlled "Hide night hours" (00:00–07:00 viewer-local). Uncontrolled when omitted. */
	hideNightHours?: boolean;
	onHideNightHoursChange?: (hide: boolean) => void;
	/** Initial value when uncontrolled. Default false. */
	defaultHideNightHours?: boolean;
	/** Max height of the scrolling area (CSS length). Default "70vh". */
	maxHeight?: string;
	className?: string;
}

const EMPTY: Selection = { available: new Set(), ifNeeded: new Set() };
const PRIMARY = "var(--color-primary, #5d2f88)";
const SURFACE = "var(--color-background, #ffffff)";
const INK = "#1f1030";
const GUTTER = "4.5rem";
const COL_MIN = "3.25rem";
const SEP = "0.5rem";

// ---- Grid

export function Grid(props: GridProps): React.JSX.Element {
	const {
		columns,
		viewerZone,
		creatorZone,
		mode,
		value = EMPTY,
		brush = "available",
		onChange,
		tallies,
		respondentCount,
		highlight,
		onSlotFocus,
		label,
		notice,
		hideNightHours,
		onHideNightHoursChange,
		defaultHideNightHours = false,
		maxHeight = "70vh",
		className,
	} = props;
	const paint = mode === "paint";

	// Keyed on content, not identity: polling hands us a fresh `columns` array on every new version,
	// and rebuilding would re-render every row and jump the scroll back to 08:00 mid-paint.
	const columnsKey = columns.map((c) => `${c.date}:${c.slots.join(",")}`).join("|");
	const columnsRef = useRef(columns);
	columnsRef.current = columns;
	const model = useMemo(
		() => buildGridModel(columnsRef.current, viewerZone, creatorZone),
		[columnsKey, viewerZone, creatorZone],
	);
	const hasNight = useMemo(() => nightRows(model).some(Boolean), [model]);
	const [hideState, setHideState] = useState(defaultHideNightHours);
	const hideNight = (hideNightHours ?? hideState) && hasNight;
	const setHideNight = (v: boolean) => {
		if (hideNightHours === undefined) setHideState(v);
		onHideNightHoursChange?.(v);
	};
	const { segments, visible } = useMemo(() => rowSegments(model, hideNight), [model, hideNight]);
	const visibleSet = useMemo(() => new Set(visible), [visible]);
	const hlStart = highlight?.start;
	const hlEnd = highlight?.end;
	const edges = useMemo(
		() => highlightEdges(model, hlStart === undefined || hlEnd === undefined ? null : { start: hlStart, end: hlEnd }),
		[model, hlStart, hlEnd],
	);

	// Track layout: gutter, then one track per column with a narrow spacer before non-adjacent dates.
	const { template, tracks, minWidth } = useMemo(() => {
		const parts = [GUTTER];
		const tracks: number[] = [];
		let seps = 0;
		for (const col of model.columns) {
			if (col.gapBefore) {
				parts.push(SEP);
				seps++;
			}
			parts.push(`minmax(${COL_MIN}, 1fr)`);
			tracks.push(parts.length); // 1-based grid line
		}
		return {
			template: parts.join(" "),
			tracks,
			minWidth: `calc(${GUTTER} + ${model.columns.length} * ${COL_MIN} + ${seps} * ${SEP})`,
		};
	}, [model]);

	// ---- Active cell (roving tabindex)
	const scrollerRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const headerRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);
	const [activeState, setActive] = useState<CellPos | null>(null);
	const [kbAnchor, setKbAnchor] = useState<CellPos | null>(null);
	const focusPending = useRef(false);
	const target = scrollTargetRow(model, visible);
	const active =
		activeState && visibleSet.has(activeState.row) && cellAt(model, activeState.col, activeState.row)
			? activeState
			: firstCell(model, visible, target);

	// Scroll so the viewer's ~08:00 is at the top, on load and when the zone or columns change.
	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		const body = bodyRef.current;
		if (!scroller || !body) return;
		const row = scrollTargetRow(model, visible);
		if (row === null) {
			scroller.scrollTop = 0;
			return;
		}
		const el = body.querySelector<HTMLElement>(`[data-rowhead="${row}"]`);
		if (el) scroller.scrollTop = Math.max(0, el.offsetTop - (headerRef.current?.offsetHeight ?? 0));
		// Only on model change, not on every night-hours toggle.
	}, [model]);

	// Move DOM focus after keyboard navigation.
	useEffect(() => {
		if (!focusPending.current || !active) return;
		focusPending.current = false;
		bodyRef.current
			?.querySelector<HTMLElement>(`[data-col="${active.col}"][data-row="${active.row}"]`)
			?.focus();
	});

	// ---- Slot focus reporting (view mode)
	const lastReported = useRef<SlotId | null | undefined>(undefined);
	const report = useCallback(
		(slot: SlotId | null) => {
			if (lastReported.current === slot) return;
			lastReported.current = slot;
			onSlotFocus?.(slot);
		},
		[onSlotFocus],
	);

	// ---- Overlay (stroke / keyboard-rectangle preview), positioned without re-rendering cells
	const geometry = useRef<{
		cols: { start: number; end: number }[];
		rows: { start: number; end: number; row: number }[];
	} | null>(null);

	const measure = () => {
		const body = bodyRef.current;
		if (!body) return null;
		const cols = [...body.querySelectorAll<HTMLElement>("[data-colhead]")].map((el) => ({
			start: el.offsetLeft,
			end: el.offsetLeft + el.offsetWidth,
		}));
		const rows = [...body.querySelectorAll<HTMLElement>("[data-rowhead]")].map((el) => ({
			start: el.offsetTop,
			end: el.offsetTop + el.offsetHeight,
			row: Number(el.dataset.rowhead),
		}));
		geometry.current = { cols, rows };
		return geometry.current;
	};

	const drawOverlay = (a: CellPos, b: CellPos, tgt: CellState) => {
		const overlay = overlayRef.current;
		const geo = geometry.current ?? measure();
		if (!overlay || !geo) return;
		const c0 = geo.cols[Math.min(a.col, b.col)];
		const c1 = geo.cols[Math.max(a.col, b.col)];
		const rIdx = (row: number) => geo.rows.find((r) => r.row === row);
		const r0 = rIdx(Math.min(a.row, b.row));
		const r1 = rIdx(Math.max(a.row, b.row));
		if (!c0 || !c1 || !r0 || !r1) return;
		overlay.style.display = "block";
		overlay.style.left = `${c0.start}px`;
		overlay.style.top = `${r0.start}px`;
		overlay.style.width = `${c1.end - c0.start}px`;
		overlay.style.height = `${r1.end - r0.start}px`;
		overlay.dataset.target = tgt;
	};
	const hideOverlay = () => {
		if (overlayRef.current) overlayRef.current.style.display = "none";
	};

	// ---- Pointer painting
	const stroke = useRef<{ id: number; anchor: CellPos; current: CellPos; target: CellState } | null>(null);
	const slotAt = useCallback((c: number, r: number) => cellAt(model, c, r)?.slot ?? null, [model]);

	const cellFromEvent = (e: { target: EventTarget | null }): CellPos | null => {
		const el = (e.target as Element | null)?.closest?.("[data-slot]") as HTMLElement | null;
		if (!el) return null;
		return { col: Number(el.dataset.col), row: Number(el.dataset.row) };
	};

	const hitTest = (clientX: number, clientY: number): CellPos | null => {
		const body = bodyRef.current;
		const geo = geometry.current;
		if (!body || !geo || geo.rows.length === 0) return null;
		const rect = body.getBoundingClientRect();
		const col = nearestIndex(geo.cols, clientX - rect.left);
		const ri = nearestIndex(geo.rows, clientY - rect.top);
		const row = geo.rows[ri]?.row;
		if (col < 0 || row === undefined) return null;
		return { col, row };
	};

	const autoScroll = (clientX: number, clientY: number) => {
		const s = scrollerRef.current;
		if (!s) return;
		const r = s.getBoundingClientRect();
		const head = headerRef.current?.offsetHeight ?? 0;
		const edge = 24;
		if (clientY < r.top + head + edge) s.scrollTop -= 12;
		else if (clientY > r.bottom - edge) s.scrollTop += 12;
		if (clientX < r.left + 72 + edge) s.scrollLeft -= 12;
		else if (clientX > r.right - edge) s.scrollLeft += 12;
	};

	const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (!paint || stroke.current) return;
		if (e.pointerType === "mouse" && e.button !== 0) return;
		const pos = cellFromEvent(e);
		if (!pos) return;
		const slot = slotAt(pos.col, pos.row);
		if (slot === null) return;
		measure();
		const tgt = strokeTarget(brush, stateOf(value, slot));
		stroke.current = { id: e.pointerId, anchor: pos, current: pos, target: tgt };
		setKbAnchor(null);
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			// Some synthetic pointers can't be captured; painting still works within the cell under the pointer.
		}
		drawOverlay(pos, pos, tgt);
		setActive(pos);
	};

	const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const s = stroke.current;
		if (s && s.id === e.pointerId) {
			autoScroll(e.clientX, e.clientY);
			const pos = hitTest(e.clientX, e.clientY);
			if (pos && (pos.col !== s.current.col || pos.row !== s.current.row)) {
				s.current = pos;
				drawOverlay(s.anchor, pos, s.target);
			}
			return;
		}
		if (!paint && e.pointerType === "mouse") {
			const pos = cellFromEvent(e);
			if (pos) report(slotAt(pos.col, pos.row));
		}
	};

	const endStroke = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
		const s = stroke.current;
		if (!s || s.id !== e.pointerId) return;
		stroke.current = null;
		geometry.current = null;
		hideOverlay();
		if (!commit) return;
		const slots = rectSlots(s.anchor, s.current, visible, slotAt);
		if (slots.length > 0) onChange?.(applyTarget(value, slots, s.target));
	};

	const onPointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (!paint && e.pointerType === "mouse") {
			const focused = document.activeElement as HTMLElement | null;
			const inside = focused && bodyRef.current?.contains(focused) && focused.dataset.slot;
			report(inside ? Number(focused.dataset.slot) : null);
		}
	};

	// ---- Keyboard
	const applyKeyboard = (from: CellPos, to: CellPos) => {
		const anchorSlot = slotAt(from.col, from.row);
		if (anchorSlot === null) return;
		const slots = rectSlots(from, to, visible, slotAt);
		onChange?.(applyTarget(value, slots, strokeTarget(brush, stateOf(value, anchorSlot))));
	};

	const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		if (!active) return;
		const dirs: Record<string, Direction> = {
			ArrowUp: "up",
			ArrowDown: "down",
			ArrowLeft: "left",
			ArrowRight: "right",
		};
		const dir = dirs[e.key];
		if (dir) {
			e.preventDefault();
			const next = step(model, visible, active, dir);
			if (paint && e.shiftKey) {
				if (!kbAnchor) setKbAnchor(active);
			} else if (kbAnchor) {
				setKbAnchor(null);
			}
			if (next) {
				focusPending.current = true;
				setActive(next);
			}
			return;
		}
		if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			if (paint) {
				applyKeyboard(kbAnchor ?? active, active);
				setKbAnchor(null);
			} else {
				report(slotAt(active.col, active.row));
			}
			return;
		}
		if (e.key === "Escape" && kbAnchor) {
			e.preventDefault();
			setKbAnchor(null);
		}
	};

	// Keyboard rectangle preview.
	useEffect(() => {
		if (stroke.current) return;
		if (paint && kbAnchor && active) {
			const anchorSlot = slotAt(kbAnchor.col, kbAnchor.row);
			measure();
			drawOverlay(kbAnchor, active, strokeTarget(brush, anchorSlot === null ? "unavailable" : stateOf(value, anchorSlot)));
			geometry.current = null;
		} else {
			hideOverlay();
		}
	});

	const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
		const el = e.target as HTMLElement;
		if (!el.dataset.slot) return;
		const pos = { col: Number(el.dataset.col), row: Number(el.dataset.row) };
		if (!active || active.col !== pos.col || active.row !== pos.row) setActive(pos);
		if (!paint) report(Number(el.dataset.slot));
	};
	const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
		if (!paint && !bodyRef.current?.contains(e.relatedTarget as Node | null)) report(null);
	};

	// ---- Render
	const noticeId = useId();

	const rowStyle = useMemo<CSSProperties>(() => ({ gridTemplateColumns: template }), [template]);
	// One character per column and row ("a", "i", "u", "-"), so memoised rows only re-render when
	// their own cells change.
	const rowStates = useMemo(() => {
		if (!paint) return [];
		const out: string[] = [];
		for (let r = 0; r < model.rowCount; r++) {
			let row = "";
			for (let c = 0; c < model.columns.length; c++) {
				const cell = cellAt(model, c, r);
				row += cell ? stateOf(value, cell.slot)[0] : "-";
			}
			out.push(row);
		}
		return out;
	}, [model, value, paint]);
	const viewerCity = zoneCity(viewerZone);
	const creatorCity = zoneCity(creatorZone);

	return (
		<div className={cn("flex flex-col gap-2", className)}>
			{(notice || hasNight) && (
				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
					{notice ? (
						<div id={noticeId} role="note" className="min-w-0 text-muted-foreground">
							{notice}
						</div>
					) : (
						<span />
					)}
					{hasNight && (
						<label className="ml-auto inline-flex cursor-pointer items-center gap-2 select-none">
							<input
								type="checkbox"
								className="size-4 accent-primary"
								checked={hideNight}
								onChange={(ev) => setHideNight(ev.target.checked)}
							/>
							Hide night hours
						</label>
					)}
				</div>
			)}
			<div
				ref={scrollerRef}
				className="relative overflow-auto rounded-md border border-black/10 bg-[var(--color-background,#fff)]"
				style={{ maxHeight }}
			>
				<div
					ref={bodyRef}
					role="grid"
					aria-label={label}
					aria-describedby={notice ? noticeId : undefined}
					aria-rowcount={model.rowCount + 1}
					aria-colcount={model.columns.length + 1}
					aria-multiselectable={paint || undefined}
					className="relative w-full select-none"
					style={{ minWidth }}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={(e) => endStroke(e, true)}
					onPointerCancel={(e) => endStroke(e, false)}
					onLostPointerCapture={(e) => endStroke(e, true)}
					onPointerLeave={onPointerLeave}
					onContextMenu={(e) => {
						if (stroke.current) e.preventDefault();
					}}
					onKeyDown={onKeyDown}
					onFocus={onFocus}
					onBlur={onBlur}
				>
					<div
						ref={headerRef}
						role="row"
						aria-rowindex={1}
						className="sticky top-0 z-20 grid border-b border-black/15 bg-[var(--color-background,#fff)]"
						style={rowStyle}
					>
						<div
							role="columnheader"
							className="sticky left-0 z-30 flex items-end bg-[var(--color-background,#fff)] px-2 pb-1 text-[0.65rem] leading-tight text-muted-foreground"
							title={`Times in ${viewerCity}`}
						>
							{viewerCity}
						</div>
						{model.columns.map((col) => (
							<div
								key={col.index}
								role="columnheader"
								data-colhead={col.index}
								aria-colindex={col.index + 2}
								className="flex flex-col items-center px-1 py-1.5 text-center leading-tight"
								style={{ gridColumn: tracks[col.index] }}
								title={
									col.headerDate !== col.date
										? `Event date ${col.date} in ${creatorCity}`
										: undefined
								}
							>
								<span className="text-xs text-muted-foreground">{col.weekday}</span>
								<span className="text-sm font-semibold whitespace-nowrap">{col.dayMonth}</span>
							</div>
						))}
					</div>

					{segments.map((seg) => {
						if (seg.kind === "hidden") {
							const first = model.rowLabels[seg.from];
							const last = model.rowLabels[seg.to];
							return (
								<div
									key={`h${seg.from}`}
									role="row"
									aria-rowindex={seg.from + 2}
									className="grid border-y border-dashed border-black/15 bg-black/[0.03]"
									style={rowStyle}
								>
									<div role="gridcell" aria-colspan={model.columns.length + 1} style={{ gridColumn: "1 / -1" }}>
										<button
											type="button"
											className="sticky left-0 px-2 py-1 text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
											style={{ outlineColor: INK }}
											onClick={() => setHideNight(false)}
										>
											{first && last ? `${first.time}–${last.endTime} hidden · Show` : "Night hours hidden · Show"}
										</button>
									</div>
								</div>
							);
						}
						return (
							<GridRow
								key={seg.row}
								model={model}
								row={seg.row}
								rowStyle={rowStyle}
								tracks={tracks}
								paint={paint}
								states={paint ? (rowStates[seg.row] ?? "") : ""}
								tallies={paint ? undefined : tallies}
								respondentCount={respondentCount}
								edges={edges}
								activeCol={active?.row === seg.row ? active.col : -1}
								viewerCity={viewerCity}
								creatorCity={creatorCity}
							/>
						);
					})}

					<div
						ref={overlayRef}
						aria-hidden="true"
						className={cn(
							"pointer-events-none absolute z-[5] hidden rounded-[3px] border-2",
							"data-[target=available]:border-primary data-[target=available]:bg-primary/35",
							"data-[target=ifNeeded]:border-primary data-[target=ifNeeded]:bg-[repeating-linear-gradient(135deg,rgb(93_47_136/0.45)_0_3px,rgb(93_47_136/0.12)_3px_7px)]",
							"data-[target=unavailable]:border-dashed data-[target=unavailable]:border-[#1f1030] data-[target=unavailable]:bg-[var(--color-background,#fff)]/60",
						)}
					/>
				</div>
			</div>
		</div>
	);
}

function DayMarker({ offset }: { offset: number }) {
	const text = offset > 0 ? `+${offset}` : `−${-offset}`;
	return (
		<span
			className="rounded-sm bg-primary/10 px-0.5 text-[0.6rem] leading-tight font-semibold text-primary"
			title={offset > 0 ? "Next day" : "Previous day"}
		>
			{text}
		</span>
	);
}

// ---- Row (memoised: only rows whose states, focus or inputs change re-render)

interface GridRowProps {
	model: GridModel;
	row: number;
	rowStyle: CSSProperties;
	tracks: number[];
	paint: boolean;
	/** Paint mode: one char per column from `stateOf` ("a" / "i" / "u"), "-" for gaps. */
	states: string;
	tallies: ReadonlyMap<SlotId, SlotTally> | undefined;
	respondentCount: number | undefined;
	edges: Map<SlotId, { top: boolean; bottom: boolean }>;
	/** Column of the active (tabbable) cell in this row, or -1. */
	activeCol: number;
	viewerCity: string;
	creatorCity: string;
}

const STATE_CODE: Record<string, CellState> = { a: "available", i: "ifNeeded", u: "unavailable" };

const GridRow = memo(function GridRow(p: GridRowProps) {
	const { model, row: r, tracks } = p;
	const rowLabel = model.rowLabels[r];
	const hourLine = rowLabel ? rowLabel.minutes % 60 < 30 : false;
	return (
		<div role="row" aria-rowindex={r + 2} className="grid" style={p.rowStyle}>
			<div
				role="rowheader"
				data-rowhead={r}
				className={cn(
					"sticky left-0 z-10 flex h-6 items-start justify-end gap-0.5 border-r border-black/10 bg-[var(--color-background,#fff)] pr-2 pl-1 text-[0.7rem] leading-none tabular-nums text-muted-foreground pointer-coarse:h-8",
					hourLine && "border-t border-t-black/10",
				)}
				title={rowLabel ? `${rowLabel.time} ${p.viewerCity} · ${rowLabel.creatorTime} ${p.creatorCity}` : undefined}
			>
				{rowLabel && (
					<>
						{/* Half-hour labels stay muted; hour labels are darker. No opacity: both must keep AA contrast. */}
							<span className={cn("pt-0.5", hourLine && "font-medium text-foreground")}>{rowLabel.time}</span>
						{rowLabel.dayOffset !== 0 && <DayMarker offset={rowLabel.dayOffset} />}
					</>
				)}
			</div>
			{model.columns.map((col) => {
				const cell = cellAt(model, col.index, r);
				if (!cell) {
					return (
						<div
							key={col.index}
							role="gridcell"
							aria-colindex={col.index + 2}
							aria-disabled="true"
							aria-label="No time slot here (clock change)"
							className="h-6 border-t border-black/5 pointer-coarse:h-8"
							style={{
								gridColumn: tracks[col.index],
								backgroundImage: "repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 6px)",
							}}
						/>
					);
				}
				const tally = p.tallies?.get(cell.slot);
				const edge = p.edges.get(cell.slot);
				const showInline =
					model.perColumnLabels &&
					!!rowLabel &&
					(cell.time !== rowLabel.time || cell.dayOffset !== rowLabel.dayOffset);
				const respondents =
					p.respondentCount ?? (tally ? tally.available.length + tally.ifNeeded.length + tally.missing.length : 0);
				return (
					<Cell
						key={col.index}
						col={col.index}
						row={r}
						track={tracks[col.index] ?? 1}
						cell={cell}
						paint={p.paint}
						state={p.paint ? (STATE_CODE[p.states[col.index] ?? "u"] ?? "unavailable") : "unavailable"}
						heatValue={!p.paint && tally ? heat(tally) : 0}
						availableCount={tally?.available.length ?? 0}
						ifNeededCount={tally?.ifNeeded.length ?? 0}
						respondents={p.paint ? 0 : respondents}
						isActive={p.activeCol === col.index}
						hlTop={edge?.top ?? false}
						hlBottom={edge?.bottom ?? false}
						inHighlight={!!edge}
						showInline={showInline}
						hourLine={hourLine}
						creatorCity={p.creatorCity}
					/>
				);
			})}
		</div>
	);
});

// ---- Cell (memoised: props are primitives so only changed cells re-render)

interface CellProps {
	col: number;
	row: number;
	track: number;
	cell: CellInfo;
	paint: boolean;
	state: CellState;
	heatValue: number;
	availableCount: number;
	ifNeededCount: number;
	respondents: number;
	isActive: boolean;
	inHighlight: boolean;
	hlTop: boolean;
	hlBottom: boolean;
	showInline: boolean;
	hourLine: boolean;
	creatorCity: string;
}

const STATE_TEXT: Record<CellState, string> = {
	available: "available",
	ifNeeded: "if needed",
	unavailable: "unavailable",
};

const Cell = memo(function Cell(p: CellProps) {
	const { cell } = p;
	const range = `${cell.dateLabel} ${cell.time}–${cell.endTime}`;
	let ariaLabel: string;
	let background: string;
	let backgroundImage: string | undefined;
	let dark = false;

	if (p.paint) {
		ariaLabel = `${range}, ${STATE_TEXT[p.state]}`;
		if (p.state === "available") {
			background = PRIMARY;
			dark = true;
		} else if (p.state === "ifNeeded") {
			background = `color-mix(in oklab, ${PRIMARY} 14%, ${SURFACE})`;
			backgroundImage = `repeating-linear-gradient(135deg, color-mix(in oklab, ${PRIMARY} 55%, ${SURFACE}) 0 3px, transparent 3px 7px)`;
		} else {
			background = SURFACE;
		}
	} else {
		const n = p.respondents;
		ariaLabel =
			n === 0
				? `${range}, no responses yet`
				: `${range}, ${p.availableCount} of ${n} available${p.ifNeededCount ? `, ${p.ifNeededCount} if needed` : ""}`;
		const h = Math.max(0, Math.min(1, p.heatValue));
		background = h > 0 ? `color-mix(in oklab, ${PRIMARY} ${Math.round(10 + 90 * h)}%, ${SURFACE})` : SURFACE;
		dark = h > 0.55;
		if (p.ifNeededCount > 0) {
			const stripe = dark ? "rgb(255 255 255 / 0.4)" : `color-mix(in oklab, ${PRIMARY} 45%, transparent)`;
			backgroundImage = `repeating-linear-gradient(135deg, ${stripe} 0 2px, transparent 2px 7px)`;
		}
	}

	const shadows: string[] = [];
	if (p.inHighlight) {
		shadows.push(`inset 2px 0 0 ${INK}`, `inset -2px 0 0 ${INK}`);
		if (p.hlTop) shadows.push(`inset 0 2px 0 ${INK}`);
		if (p.hlBottom) shadows.push(`inset 0 -2px 0 ${INK}`);
	}

	return (
		<div
			role="gridcell"
			data-slot={cell.slot}
			data-col={p.col}
			data-row={p.row}
			aria-colindex={p.col + 2}
			aria-selected={p.paint ? p.state !== "unavailable" : undefined}
			aria-label={ariaLabel}
			title={`${ariaLabel} · ${cell.creatorTime} ${p.creatorCity}`}
			tabIndex={p.isActive ? 0 : -1}
			className={cn(
				"relative h-6 border-t border-l border-l-black/5 pointer-coarse:h-8",
				p.hourLine ? "border-t-black/15" : "border-t-black/5",
				"scroll-mt-14 scroll-ml-[4.5rem] [-webkit-touch-callout:none]",
				p.paint ? "cursor-pointer touch-none" : "cursor-default",
				"motion-safe:transition-[background-color] motion-safe:duration-150",
				"focus-visible:z-[6] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1f1030] focus-visible:[box-shadow:inset_0_0_0_4px_#fff]",
			)}
			style={{
				gridColumn: p.track,
				backgroundColor: background,
				backgroundImage,
				boxShadow: shadows.length ? shadows.join(", ") : undefined,
			}}
		>
			{p.showInline && (
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute top-0.5 left-1 text-[0.6rem] leading-none tabular-nums",
						dark ? "text-white" : "text-muted-foreground",
					)}
				>
					{cell.time}
					{cell.dayOffset !== 0 && (cell.dayOffset > 0 ? ` +${cell.dayOffset}` : ` −${-cell.dayOffset}`)}
				</span>
			)}
		</div>
	);
});

// ---- Brush picker

export interface BrushPickerProps {
	value: Brush;
	onChange: (brush: Brush) => void;
}

const BRUSHES: { brush: Brush; label: string; hint: string }[] = [
	{ brush: "available", label: "Available", hint: "I can make it" },
	{ brush: "ifNeeded", label: "If needed", hint: "Possible, but I'd rather not" },
	{ brush: "erase", label: "Erase", hint: "Back to unavailable" },
];

function Swatch({ brush, onDark = false }: { brush: Brush; onDark?: boolean }) {
	const style: CSSProperties =
		brush === "available"
			? { backgroundColor: PRIMARY }
			: brush === "ifNeeded"
				? {
						backgroundColor: `color-mix(in oklab, ${PRIMARY} 14%, ${SURFACE})`,
						backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${PRIMARY} 55%, ${SURFACE}) 0 3px, transparent 3px 7px)`,
					}
				: { backgroundColor: SURFACE };
	return (
		<span
			aria-hidden="true"
			className={cn(
				"size-4 shrink-0 rounded-sm border",
				onDark ? "border-white" : "border-black/25",
				brush === "erase" && "border-dashed",
			)}
			style={style}
		/>
	);
}

export function BrushPicker(props: BrushPickerProps): React.JSX.Element {
	const { value, onChange } = props;
	const refs = useRef<(HTMLButtonElement | null)[]>([]);
	const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		const i = BRUSHES.findIndex((b) => b.brush === value);
		let j = -1;
		if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % BRUSHES.length;
		else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + BRUSHES.length) % BRUSHES.length;
		if (j < 0) return;
		e.preventDefault();
		const next = BRUSHES[j];
		if (next) {
			onChange(next.brush);
			refs.current[j]?.focus();
		}
	};
	return (
		<div
			role="radiogroup"
			aria-label="Brush"
			className="inline-flex flex-wrap gap-1 rounded-lg border border-black/10 bg-[var(--color-background,#fff)] p-1"
			onKeyDown={onKeyDown}
		>
			{BRUSHES.map((b, i) => {
				const checked = b.brush === value;
				return (
					<button
						key={b.brush}
						ref={(el) => {
							refs.current[i] = el;
						}}
						type="button"
						role="radio"
						aria-checked={checked}
						tabIndex={checked ? 0 : -1}
						title={b.hint}
						onClick={() => onChange(b.brush)}
						className={cn(
							"inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium",
							"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f1030]",
							"motion-safe:transition-colors",
							checked ? "bg-primary text-white" : "text-[#1f1030] hover:bg-primary/10",
						)}
					>
						<Swatch brush={b.brush} onDark={checked} />
						{b.label}
					</button>
				);
			})}
		</div>
	);
}

// ---- Legend (optional helper for the page)

export function GridLegend({ mode, respondentCount }: { mode: "paint" | "view"; respondentCount?: number }) {
	if (mode === "paint") {
		return (
			<ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				{BRUSHES.map((b) => (
					<li key={b.brush} className="inline-flex items-center gap-1.5">
						<Swatch brush={b.brush} />
						{b.brush === "erase" ? "Unavailable" : b.label}
					</li>
				))}
			</ul>
		);
	}
	const steps = [0, 0.25, 0.5, 0.75, 1];
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
			<span className="inline-flex items-center gap-1.5">
				<span>Fewer</span>
				<span className="inline-flex" aria-hidden="true">
					{steps.map((h) => (
						<span
							key={h}
							className="size-4 border border-black/10"
							style={{
								backgroundColor: h > 0 ? `color-mix(in oklab, ${PRIMARY} ${Math.round(10 + 90 * h)}%, ${SURFACE})` : SURFACE,
							}}
						/>
					))}
				</span>
				<span>More{respondentCount ? ` (of ${respondentCount})` : ""}</span>
			</span>
			<span className="inline-flex items-center gap-1.5">
				<Swatch brush="ifNeeded" />
				Hatched: someone is "if needed"
			</span>
		</div>
	);
}
