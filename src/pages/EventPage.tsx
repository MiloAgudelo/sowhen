import { Loader2Icon, PaintbrushIcon, SettingsIcon, Share2Icon, Trash2Icon, UsersIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/common/CopyField";
import { BestTimesList, Notice, Respondents, SlotDetail, ZoneBar } from "@/components/event/EventParts";
import { DurationField } from "@/components/event-form/fields";
import { BrushPicker, type Brush, Grid, type Selection } from "@/components/grid/Grid";
import { PageShell } from "@/components/layout/SiteChrome";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	allSlots,
	cleanDisplayName,
	MAX_DISPLAY_NAME,
	normaliseName,
	offsetMinutes,
	offsetShifts,
	rankBestTimes,
	tallySlots,
} from "@/domain";
import { api, errorMessage } from "@/lib/api-client";
import { adminPath, eventUrl, linkProps, useDocumentTitle } from "@/lib/route";
import { adminSecret, hideNightHoursPref, rememberedName } from "@/lib/storage";
import { type OwnDraft, useEventSnapshot } from "@/lib/use-event-snapshot";
import { useViewerZone } from "@/lib/use-viewer-zone";
import { cn } from "@/lib/utils";
import { formatDay, zoneCity } from "@/lib/zones";
import type { BestTime, Column, EventDto, MeetingDuration, ResponseDto, SlotId, ZoneId } from "@/shared/types";
import { NotFoundPage } from "./NotFoundPage";

type Tab = "paint" | "results";

const EMPTY_SELECTION: Selection = { available: new Set(), ifNeeded: new Set() };

function selectionOf(r: ResponseDto | undefined): Selection {
	if (!r) return EMPTY_SELECTION;
	return { available: new Set(r.available), ifNeeded: new Set(r.ifNeeded) };
}

export function EventPage({ slug }: { slug: string }) {
	const [name, setName] = useState(() => rememberedName.get(slug) ?? "");
	const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
	const [dirty, setDirty] = useState(false);

	const display = cleanDisplayName(name);
	const nameKey = display ? normaliseName(display) : null;

	const draft = useMemo<OwnDraft | null>(() => {
		if (!dirty || !nameKey || !display) return null;
		return {
			nameKey,
			response: {
				name: display,
				nameKey,
				available: [...selection.available].sort((a, b) => a - b),
				ifNeeded: [...selection.ifNeeded].sort((a, b) => a - b),
				updatedAt: new Date().toISOString(),
			},
		};
	}, [dirty, nameKey, display, selection]);

	const { status, snapshot, responses, refetch, error } = useEventSnapshot(slug, draft);

	if (status === "notFound") return <NotFoundPage />;
	if (!snapshot)
		return (
			<PageShell>
				{status === "error" ? (
					<div className="grid max-w-md gap-3 pt-10">
						<h1 className="text-2xl font-semibold">Can't load this event</h1>
						<p className="text-muted-foreground">{error ? errorMessage(error) : "Something went wrong."}</p>
						<Button className="w-fit" onClick={() => void refetch()}>
							Try again
						</Button>
					</div>
				) : (
					<div className="flex items-center gap-2 pt-10 text-muted-foreground" role="status">
						<Loader2Icon className="size-5 animate-spin" /> Loading event…
					</div>
				)}
			</PageShell>
		);

	return (
		<EventView
			slug={slug}
			event={snapshot.event}
			serverResponses={snapshot.responses}
			responses={responses}
			refetch={refetch}
			name={name}
			setName={setName}
			display={display}
			nameKey={nameKey}
			selection={selection}
			setSelection={setSelection}
			dirty={dirty}
			setDirty={setDirty}
			offline={!!error}
		/>
	);
}

interface EventViewProps {
	slug: string;
	event: EventDto;
	serverResponses: ResponseDto[];
	responses: ResponseDto[];
	refetch: () => Promise<void>;
	name: string;
	setName: (n: string) => void;
	display: string | null;
	nameKey: string | null;
	selection: Selection;
	setSelection: (s: Selection) => void;
	dirty: boolean;
	setDirty: (d: boolean) => void;
	offline: boolean;
}

function EventView({
	slug,
	event,
	serverResponses,
	responses,
	refetch,
	name,
	setName,
	display,
	nameKey,
	selection,
	setSelection,
	dirty,
	setDirty,
	offline,
}: EventViewProps) {
	useDocumentTitle(`${event.title} · sowhen`);
	const [viewerZone, setViewerZone] = useViewerZone();
	const [tab, setTab] = useState<Tab>(() => (serverResponses.length > 0 ? "results" : "paint"));
	const [brush, setBrush] = useState<Brush>("available");
	const [saving, setSaving] = useState(false);
	const [duration, setDuration] = useState<MeetingDuration>(event.durationMinutes);
	const [highlight, setHighlight] = useState<BestTime | null>(null);
	const [focused, setFocused] = useState<SlotId | null>(null);
	const [hideNight, setHideNight] = useState(() => hideNightHoursPref.get());
	const [nameError, setNameError] = useState<string | null>(null);
	const nameId = useId();
	const nameHelpId = useId();
	const gridRef = useRef<HTMLDivElement>(null);
	const isAdmin = !!adminSecret.get(slug);

	const columns: Column[] = event.columns;
	const slots = useMemo(() => allSlots(columns), [columns]);
	const firstSlot = slots[0] ?? 0;

	const existing = useMemo(
		() => (nameKey ? serverResponses.find((r) => r.nameKey === nameKey) : undefined),
		[serverResponses, nameKey],
	);

	// While nothing is painted locally, the selection follows the server's copy of this name's response
	// (including updates from another device). Once painted, the draft is kept (ADR 0009).
	useEffect(() => {
		if (!dirty) setSelection(selectionOf(existing));
	}, [existing, dirty, setSelection]);

	// Warn before leaving with unsaved painting.
	useEffect(() => {
		if (!dirty) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [dirty]);

	const tallies = useMemo(() => tallySlots(slots, responses), [slots, responses]);
	const best = useMemo(() => rankBestTimes(columns, responses, duration, 5), [columns, responses, duration]);

	// Drop a highlight that no longer exists after an update.
	useEffect(() => {
		if (highlight && !best.some((b) => b.start === highlight.start && b.end === highlight.end)) setHighlight(null);
	}, [best, highlight]);

	const shift = useMemo(() => dstNotice(columns, slots, viewerZone, event.creatorZone), [columns, slots, viewerZone, event.creatorZone]);

	const save = async () => {
		if (!display) {
			setNameError("Type your name first, so others know who's free.");
			document.getElementById(nameId)?.focus();
			return;
		}
		setNameError(null);
		setSaving(true);
		try {
			await api.putResponse(slug, {
				name: display,
				available: [...selection.available].sort((a, b) => a - b),
				ifNeeded: [...selection.ifNeeded].sort((a, b) => a - b),
			});
			rememberedName.set(slug, display);
			await refetch();
			setDirty(false);
			toast.success("Saved", "Here's where everyone overlaps.");
			setTab("results");
		} catch (err) {
			toast.error("Couldn't save", errorMessage(err));
		} finally {
			setSaving(false);
		}
	};

	const deleteMine = async () => {
		if (!existing) return;
		try {
			await api.deleteResponse(slug, existing.nameKey);
			rememberedName.set(slug, null);
			setDirty(false);
			setSelection(EMPTY_SELECTION);
			await refetch();
			toast.success("Response deleted");
		} catch (err) {
			toast.error("Couldn't delete", errorMessage(err));
		}
	};

	const selectBest = (b: BestTime | null) => {
		setHighlight(b);
		if (b && window.matchMedia("(max-width: 1023px)").matches) {
			gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	};

	const respondentNames = responses.map((r) => r.name);
	const painted = selection.available.size + selection.ifNeeded.size;

	return (
		<PageShell
			header={
				<div className="flex items-center gap-1">
					{isAdmin && (
						<Button asChild variant="ghost" size="sm">
							<a {...linkProps(adminPath(slug))}>
								<SettingsIcon />
								<span className="hidden sm:inline">Manage</span>
								<span className="sr-only sm:hidden">Manage event</span>
							</a>
						</Button>
					)}
					<ShareButton slug={slug} title={event.title} />
				</div>
			}
		>
			<div className="grid grid-cols-1 gap-4 pt-2">
				<div className="grid gap-2">
					<h1 className="text-3xl font-semibold tracking-tight text-balance break-words sm:text-4xl">{event.title}</h1>
					<ZoneBar viewerZone={viewerZone} creatorZone={event.creatorZone} onChange={setViewerZone} at={firstSlot} />
					{offline && (
						<p className="text-sm text-muted-foreground" role="status">
							Can't reach sowhen right now. Showing the last update.
						</p>
					)}
				</div>

				<ToggleGroup
					type="single"
					variant="outline"
					value={tab}
					onValueChange={(v) => v && setTab(v as Tab)}
					aria-label="View"
					className="w-full sm:w-fit"
				>
					<ToggleGroupItem value="paint" className="px-4">
						<PaintbrushIcon /> Add your times
					</ToggleGroupItem>
					<ToggleGroupItem value="results" className="px-4">
						<UsersIcon /> Results
						<span className="rounded-full bg-background/20 px-1.5 text-xs tabular-nums">{responses.length}</span>
					</ToggleGroupItem>
				</ToggleGroup>

				{tab === "paint" ? (
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
						<div className="grid min-w-0 gap-3 lg:order-2">
							<div className="grid gap-2">
								<Label htmlFor={nameId}>Your name</Label>
								<Input
									id={nameId}
									value={name}
									maxLength={MAX_DISPLAY_NAME}
									onChange={(e) => {
										setName(e.target.value);
										setNameError(null);
									}}
									placeholder="e.g. Anna"
									autoComplete="given-name"
									aria-describedby={nameHelpId}
									aria-invalid={!!nameError}
									className="h-11 text-base"
								/>
								<p id={nameHelpId} className={cn("text-sm", nameError ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
									{nameError ??
										(existing ? (
											<>
												You're editing <span className="font-medium text-foreground">{existing.name}</span>'s response.
											</>
										) : display ? (
											"New response. Not you? Add a surname or initial."
										) : (
											"Others see this name next to your times."
										))}
								</p>
							</div>
							<div className="grid gap-2">
								<span className="text-sm font-medium">Brush</span>
								<BrushPicker value={brush} onChange={setBrush} />
							</div>
							<p className="text-sm text-muted-foreground">
								Drag across the grid to paint. Use <span className="font-medium text-foreground">if needed</span> for
								times you could make but would rather not.
							</p>
						</div>
						<div ref={gridRef} className="min-w-0 scroll-mt-4 lg:order-1">
							<Grid
								columns={columns}
								viewerZone={viewerZone}
								creatorZone={event.creatorZone}
								mode="paint"
								value={selection}
								brush={brush}
								onChange={(next) => {
									setSelection(next);
									setDirty(true);
								}}
								notice={shift ? <Notice>{shift}</Notice> : undefined}
								hideNightHours={hideNight}
								onHideNightHoursChange={(h) => {
									setHideNight(h);
									hideNightHoursPref.set(h);
								}}
								label={`${event.title}: your availability`}
							/>
						</div>
						<div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border lg:order-3 lg:col-span-2">
							<Button onClick={() => void save()} disabled={saving} size="lg" className="flex-1 sm:flex-none">
								{saving && <Loader2Icon className="animate-spin" />}
								{existing ? "Save changes" : "Save my times"}
							</Button>
							<p className="text-sm text-muted-foreground" aria-live="polite">
								{dirty ? "Unsaved changes" : painted ? `${painted} slots marked` : "Nothing painted yet"}
							</p>
							{existing && (
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive">
											<Trash2Icon /> Delete my response
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Delete {existing.name}'s response?</AlertDialogTitle>
											<AlertDialogDescription>
												Their times disappear for everyone. This can't be undone.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Keep it</AlertDialogCancel>
											<AlertDialogAction
												className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
												onClick={() => void deleteMine()}
											>
												Delete
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							)}
						</div>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
						<div className="grid min-w-0 gap-3">
							<Respondents names={respondentNames} />
							<div ref={gridRef} className="min-w-0 scroll-mt-4">
								<Grid
									columns={columns}
									viewerZone={viewerZone}
									creatorZone={event.creatorZone}
									mode="view"
									tallies={tallies}
									respondentCount={responses.length}
									highlight={highlight ? { start: highlight.start, end: highlight.end } : null}
									onSlotFocus={setFocused}
									notice={shift ? <Notice>{shift}</Notice> : undefined}
									hideNightHours={hideNight}
									onHideNightHoursChange={(h) => {
										setHideNight(h);
										hideNightHoursPref.set(h);
									}}
									label={`${event.title}: everyone's availability`}
								/>
							</div>
							<Card className="gap-3 py-4 lg:hidden">
								<CardContent>
									<SlotDetail
										slot={focused}
										tally={focused !== null ? tallies.get(focused) : undefined}
										viewerZone={viewerZone}
										creatorZone={event.creatorZone}
									/>
								</CardContent>
							</Card>
						</div>
						<div className="grid gap-4 lg:sticky lg:top-4">
							<Card className="gap-4">
								<CardHeader>
									<CardTitle>Best times</CardTitle>
								</CardHeader>
								<CardContent className="grid gap-4">
									<BestTimesList
										items={best}
										viewerZone={viewerZone}
										creatorZone={event.creatorZone}
										total={responses.length}
										selected={highlight}
										onSelect={selectBest}
									/>
									<DurationField
										value={duration}
										onChange={setDuration}
										hint={
											duration === event.durationMinutes
												? "Only changes this list, just for you."
												: "Only for you. The event's meeting length stays the same."
										}
									/>
								</CardContent>
							</Card>
							<Card className="hidden gap-3 py-4 lg:flex">
								<CardContent>
									<SlotDetail
										slot={focused}
										tally={focused !== null ? tallies.get(focused) : undefined}
										viewerZone={viewerZone}
										creatorZone={event.creatorZone}
									/>
								</CardContent>
							</Card>
						</div>
					</div>
				)}
			</div>
		</PageShell>
	);
}

function ShareButton({ slug, title }: { slug: string; title: string }) {
	const url = eventUrl(slug);
	const canShare = typeof navigator !== "undefined" && "share" in navigator;
	const share = useCallback(async () => {
		try {
			await navigator.share({ title, url });
		} catch {
			// cancelled
		}
	}, [title, url]);
	if (canShare && window.matchMedia("(pointer: coarse)").matches)
		return (
			<Button variant="outline" size="sm" onClick={() => void share()}>
				<Share2Icon /> Share
			</Button>
		);
	return <CopyButton text={url} label="Copy link" copiedLabel="Link copied" size="sm" />;
}

/** "Your local times shift by 1 h from Sun 28 Mar" when the viewer↔creator offset changes inside the event. */
function dstNotice(columns: Column[], slots: SlotId[], viewerZone: ZoneId, creatorZone: ZoneId): string | null {
	if (zoneCity(viewerZone) === zoneCity(creatorZone) && viewerZone === creatorZone) return null;
	const { shifts, at } = offsetShifts(columns, viewerZone, creatorZone);
	if (!shifts) return null;
	const parts = at.map((s) => {
		const i = slots.indexOf(s);
		const prev = slots[i - 1] ?? s;
		const rel = (x: SlotId) => offsetMinutes(viewerZone, x) - offsetMinutes(creatorZone, x);
		const delta = Math.abs(rel(s) - rel(prev));
		const amount = delta % 60 === 0 ? `${delta / 60} h` : `${delta} min`;
		return `by ${amount} from ${formatDay(s, viewerZone)}`;
	});
	return `Daylight saving changes during this event: your local times shift ${parts.join(", and ")}, compared with ${zoneCity(creatorZone)} time.`;
}
