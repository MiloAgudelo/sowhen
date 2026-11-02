import { ArrowRightIcon, CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CopyField } from "@/components/common/CopyField";
import { ZonePicker } from "@/components/common/ZonePicker";
import { DatesField, DurationField, WindowField } from "@/components/event-form/fields";
import { PageShell } from "@/components/layout/SiteChrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SLUG_MAX_LENGTH, slugify, validateSlug } from "@/domain";
import { ApiRequestError, api, errorMessage } from "@/lib/api-client";
import { adminUrl, eventPath, eventUrl, navigate, useDocumentTitle } from "@/lib/route";
import { adminSecret } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { browserZone, todayIn } from "@/lib/zones";
import type { CreateEventResult, SlugCheck } from "@/shared/api";
import type { DailyWindow, IsoDate, MeetingDuration, ZoneId } from "@/shared/types";

type SlugState =
	| { kind: "empty" }
	| { kind: "checking" }
	| { kind: "available" }
	| { kind: "taken"; suggestion?: string }
	| { kind: "invalid"; reason: "format" | "reserved"; suggestion?: string }
	| { kind: "unknown" };

const TITLE_MAX = 80;

export function CreatePage() {
	useDocumentTitle("sowhen: find a time across time zones");
	const [created, setCreated] = useState<CreateEventResult | null>(null);

	return (
		<PageShell hero={created ? undefined : <CreateIntro />}>
			{created ? <SaveAdminLink result={created} /> : <CreateForm onCreated={setCreated} />}
		</PageShell>
	);
}

/** Headline on the photo band (PageShell `hero`). */
function CreateIntro() {
	return (
		<section className="mx-auto w-full max-w-2xl">
			<h1 className="max-w-2xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem]">
				Find a time that works, <span className="text-brand-200">in everyone's time zone.</span>
			</h1>
			<p className="mt-4 max-w-lg text-lg text-white/85">
				Make an event, share the link, and everyone paints when they're free. Each person sees the grid in their
				own time. No accounts.
			</p>
		</section>
	);
}

function CreateForm({ onCreated }: { onCreated: (r: CreateEventResult) => void }) {
	const [title, setTitle] = useState("");
	const [slug, setSlug] = useState("");
	const [slugTouched, setSlugTouched] = useState(false);
	const [zone, setZone] = useState<ZoneId>(() => browserZone());
	const [dates, setDates] = useState<IsoDate[]>([]);
	const [dailyWindow, setDailyWindow] = useState<DailyWindow>({ start: "07:00", end: "22:00" });
	const [duration, setDuration] = useState<MeetingDuration>(60);
	const [slugState, setSlugState] = useState<SlugState>({ kind: "empty" });
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [showErrors, setShowErrors] = useState(false);
	const titleId = useId();
	const slugId = useId();
	const slugHelpId = useId();
	const zoneId = useId();

	const today = todayIn(zone);

	// Suggest a slug from the title until the creator edits the slug by hand.
	useEffect(() => {
		if (!slugTouched) setSlug(slugify(title).slice(0, SLUG_MAX_LENGTH).replace(/-+$/, ""));
	}, [title, slugTouched]);

	// Live availability check, debounced (ADR 0004).
	useEffect(() => {
		if (!slug) {
			setSlugState({ kind: "empty" });
			return;
		}
		const local = validateSlug(slug);
		if (!local.ok) {
			setSlugState({ kind: "invalid", reason: local.reason });
			return;
		}
		setSlugState({ kind: "checking" });
		const ctrl = new AbortController();
		const t = setTimeout(async () => {
			try {
				const r: SlugCheck = await api.checkSlug(slug, ctrl.signal);
				if (ctrl.signal.aborted) return;
				if (r.available) setSlugState({ kind: "available" });
				else if (r.reason) setSlugState({ kind: "invalid", reason: r.reason, suggestion: r.suggestion });
				else setSlugState({ kind: "taken", suggestion: r.suggestion });
			} catch {
				if (!ctrl.signal.aborted) setSlugState({ kind: "unknown" });
			}
		}, 350);
		return () => {
			clearTimeout(t);
			ctrl.abort();
		};
	}, [slug]);

	const titleError = !title.trim() ? "Give your event a name." : null;
	const slugError =
		slugState.kind === "empty"
			? "Pick a link."
			: slugState.kind === "invalid"
				? slugState.reason === "reserved"
					? "That link is reserved. Try another."
					: "Use 3–48 lowercase letters, numbers and single hyphens."
				: slugState.kind === "taken"
					? "That link is taken."
					: null;
	const datesError = dates.length === 0 ? "Pick at least one date." : null;
	const hasErrors = !!(titleError || slugError || datesError);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setShowErrors(true);
		setFormError(null);
		if (hasErrors || submitting) return;
		setSubmitting(true);
		try {
			const result = await api.createEvent({
				slug,
				title: title.trim(),
				creatorZone: zone,
				dates,
				window: dailyWindow,
				durationMinutes: duration,
			});
			adminSecret.set(result.event.slug, result.adminSecret);
			onCreated(result);
			window.scrollTo({ top: 0 });
		} catch (err) {
			if (err instanceof ApiRequestError && err.code === "slug_taken") {
				setSlugState({ kind: "taken" });
				// Ask again, to offer a free alternative.
				api
					.checkSlug(slug)
					.then((r) => setSlugState({ kind: "taken", suggestion: r.suggestion }))
					.catch(() => {});
			}
			setFormError(errorMessage(err));
		} finally {
			setSubmitting(false);
		}
	};

	const host = typeof location !== "undefined" ? location.host : "sowhen.uk";

	return (
		<div className="mx-auto w-full max-w-2xl">
			<div className="min-w-0">
				<form onSubmit={submit} noValidate className="grid grid-cols-1 gap-8" aria-labelledby="create-heading">
					<h2 id="create-heading" className="sr-only">
						Create an event
					</h2>
					<Card className="gap-6">
						<CardContent className="grid grid-cols-1 gap-6">
							<div className="grid gap-2">
								<Label htmlFor={titleId}>Event name</Label>
								<Input
									id={titleId}
									value={title}
									maxLength={TITLE_MAX}
									onChange={(e) => setTitle(e.target.value)}
									placeholder="Comms weekly sync"
									autoComplete="off"
									aria-invalid={showErrors && !!titleError}
									className="h-11 text-base"
								/>
								{showErrors && titleError && <p className="text-sm text-destructive">{titleError}</p>}
							</div>

							<div className="grid gap-2">
								<Label htmlFor={slugId}>Link</Label>
								<div
									className={cn(
										"flex h-10 items-center rounded-md border border-input bg-card shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40",
										showErrors && slugError && "border-destructive",
									)}
								>
									<span className="shrink-0 pl-3 text-sm text-muted-foreground select-none">{host}/</span>
									<input
										id={slugId}
										value={slug}
										maxLength={SLUG_MAX_LENGTH}
										onChange={(e) => {
											setSlugTouched(true);
											setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
										}}
										placeholder="comms-weekly"
										autoComplete="off"
										autoCapitalize="none"
										spellCheck={false}
										aria-describedby={slugHelpId}
										aria-invalid={showErrors && !!slugError}
										className="h-full w-0 min-w-0 flex-1 bg-transparent pr-3 text-base outline-none md:text-sm"
									/>
									<SlugIndicator state={slugState} />
								</div>
								<div id={slugHelpId} className="text-sm" aria-live="polite">
									<SlugMessage
										state={slugState}
										onUse={(s) => {
											setSlugTouched(true);
											setSlug(s);
										}}
									/>
								</div>
							</div>

							<div className="grid gap-2">
								<Label htmlFor={zoneId}>Your time zone</Label>
								<ZonePicker id={zoneId} value={zone} onChange={setZone} className="sm:max-w-sm" />
								<p className="text-sm text-muted-foreground">
									Dates and the time window are in this zone. Everyone else sees them in theirs.
								</p>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardContent>
							<DatesField
								value={dates}
								onChange={setDates}
								min={today}
								error={showErrors ? datesError : null}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="grid grid-cols-1 gap-6">
							<WindowField value={dailyWindow} onChange={setDailyWindow} creatorZone={zone} previewDate={dates[0] ?? today} />
							<DurationField value={duration} onChange={setDuration} />
						</CardContent>
					</Card>

					<div className="grid gap-3">
						{formError && (
							<p role="alert" className="flex items-start gap-2 text-sm text-destructive">
								<TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
								{formError}
							</p>
						)}
						{showErrors && hasErrors && !formError && (
							<p role="alert" className="text-sm text-destructive">
								Check the fields marked above.
							</p>
						)}
						<Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-fit">
							{submitting ? <Loader2Icon className="animate-spin" /> : null}
							Create event
							{!submitting && <ArrowRightIcon />}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}

function SlugIndicator({ state }: { state: SlugState }) {
	if (state.kind === "checking")
		return <Loader2Icon aria-hidden className="mr-3 size-4 shrink-0 animate-spin text-muted-foreground" />;
	if (state.kind === "available") return <CheckCircle2Icon aria-hidden className="mr-3 size-4 shrink-0 text-success" />;
	if (state.kind === "taken" || state.kind === "invalid")
		return <TriangleAlertIcon aria-hidden className="mr-3 size-4 shrink-0 text-destructive" />;
	return null;
}

function SlugMessage({ state, onUse }: { state: SlugState; onUse: (s: string) => void }) {
	const suggestion =
		(state.kind === "taken" || state.kind === "invalid") && state.suggestion ? (
			<>
				{" "}
				How about{" "}
				<button
					type="button"
					onClick={() => onUse(state.suggestion ?? "")}
					className="font-medium text-primary underline underline-offset-4"
				>
					{state.suggestion}
				</button>
				?
			</>
		) : null;
	switch (state.kind) {
		case "empty":
			return <span className="text-muted-foreground">Letters, numbers and hyphens. Anyone with the link can respond.</span>;
		case "checking":
			return <span className="text-muted-foreground">Checking…</span>;
		case "available":
			return <span className="text-success">That link is free.</span>;
		case "taken":
			return (
				<span className="text-destructive">
					That link is taken.
					{suggestion}
				</span>
			);
		case "invalid":
			return (
				<span className="text-destructive">
					{state.reason === "reserved"
						? "That link is reserved."
						: "Use 3–48 lowercase letters, numbers and single hyphens."}
					{suggestion}
				</span>
			);
		case "unknown":
			return <span className="text-muted-foreground">Couldn't check the link right now. We'll check when you create.</span>;
	}
}

function SaveAdminLink({ result }: { result: CreateEventResult }) {
	const { event } = result;
	const admin = adminUrl(event.slug, result.adminSecret);
	const share = eventUrl(event.slug);
	const headingRef = useRef<HTMLHeadingElement>(null);
	useDocumentTitle(`Save your admin link · ${event.title}`);
	useEffect(() => headingRef.current?.focus(), []);

	return (
		<div className="mx-auto grid max-w-xl gap-6 pt-6">
			<div>
				<p className="text-sm font-medium text-success">Event created</p>
				<h1 ref={headingRef} tabIndex={-1} className="mt-1 text-3xl font-semibold tracking-tight outline-none">
					Save your admin link
				</h1>
				<p className="mt-2 text-muted-foreground">
					It's the only way to edit or delete <span className="font-medium text-foreground">{event.title}</span>{" "}
					later. We can't send it to you again: there are no accounts.
				</p>
			</div>
			<Card>
				<CardContent className="grid grid-cols-1 gap-6">
					<CopyField
						label="Admin link (keep it private)"
						value={admin}
						emphasis
						hint="Save it in your notes or password manager. This browser remembers it too."
					/>
					<CopyField label="Share link (send it to your group)" value={share} />
				</CardContent>
			</Card>
			<Button size="lg" className="w-full sm:w-fit" onClick={() => navigate(eventPath(event.slug))}>
				I've saved it, go to the event
				<ArrowRightIcon />
			</Button>
		</div>
	);
}
