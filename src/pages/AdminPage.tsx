// Admin page (ADR 0007): /<slug>/admin#<secret>. The secret is read from the fragment, stored in
// localStorage, stripped from the URL, then checked with GET /api/events/:slug/admin.
import { ArrowLeftIcon, KeyRoundIcon, Loader2Icon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { CopyField } from "@/components/common/CopyField";
import { DatesField, DurationField, WindowField } from "@/components/event-form/fields";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { allSlots, generateColumns } from "@/domain";
import { ApiRequestError, api, errorMessage } from "@/lib/api-client";
import { adminUrl, eventPath, eventUrl, linkProps, navigate, useDocumentTitle } from "@/lib/route";
import { adminSecret } from "@/lib/storage";
import { useEventSnapshot } from "@/lib/use-event-snapshot";
import { zoneCity } from "@/lib/zones";
import type { PatchEventInput } from "@/shared/api";
import type { DailyWindow, EventDto, EventSnapshot, IsoDate, MeetingDuration, ResponseDto } from "@/shared/types";
import { NotFoundPage } from "./NotFoundPage";

type AuthState = "checking" | "ok" | "forbidden" | "missing" | "notFound" | "error";

/** Take the secret from the URL fragment (once), store it, and remove it from the address bar. */
function takeSecret(slug: string): string | null {
	const hash = window.location.hash.replace(/^#/, "");
	if (hash) {
		let secret = hash;
		try {
			secret = decodeURIComponent(hash);
		} catch {
			// keep raw
		}
		adminSecret.set(slug, secret);
		window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
		return secret;
	}
	return adminSecret.get(slug);
}

export function AdminPage({ slug }: { slug: string }) {
	const [secret] = useState(() => takeSecret(slug));
	const [auth, setAuth] = useState<AuthState>(secret ? "checking" : "missing");

	useEffect(() => {
		if (!secret) return;
		const ctrl = new AbortController();
		api
			.verifyAdmin(slug, secret, ctrl.signal)
			.then(() => setAuth("ok"))
			.catch((err) => {
				if (ctrl.signal.aborted) return;
				if (err instanceof ApiRequestError && err.status === 404) setAuth("notFound");
				else if (err instanceof ApiRequestError && err.status === 403) setAuth("forbidden");
				else setAuth("error");
			});
		return () => ctrl.abort();
	}, [slug, secret]);

	useDocumentTitle("Manage event · sowhen");

	if (auth === "notFound") return <NotFoundPage />;
	if (auth === "ok" && secret) return <AdminEditor slug={slug} secret={secret} />;

	return (
		<PageShell>
			<div className="grid max-w-lg gap-4 pt-10">
				{auth === "checking" ? (
					<p className="flex items-center gap-2 text-muted-foreground" role="status">
						<Loader2Icon className="size-5 animate-spin" /> Checking your admin link…
					</p>
				) : (
					<>
						<KeyRoundIcon className="size-8 text-primary" aria-hidden />
						<h1 className="text-3xl font-semibold tracking-tight">
							{auth === "error" ? "Can't check your admin link" : "This admin link doesn't work"}
						</h1>
						<p className="text-muted-foreground">
							{auth === "error"
								? "We couldn't reach sowhen. Check your connection and reload the page."
								: auth === "missing"
									? "Open the full admin link you saved when you created the event. It ends with a long code after #."
									: "The code in the link isn't right for this event. Check you copied the whole admin link."}
						</p>
						{auth === "forbidden" && (
							<Button
								variant="outline"
								className="w-fit"
								onClick={() => {
									adminSecret.set(slug, null);
									setAuth("missing");
								}}
							>
								Forget the saved link
							</Button>
						)}
						<Button asChild className="w-fit">
							<a {...linkProps(eventPath(slug))}>Go to the event</a>
						</Button>
					</>
				)}
			</div>
		</PageShell>
	);
}

function AdminEditor({ slug, secret }: { slug: string; secret: string }) {
	const { status, snapshot, refetch, setSnapshot } = useEventSnapshot(slug);
	if (status === "notFound") return <NotFoundPage />;
	if (!snapshot)
		return (
			<PageShell>
				<p className="flex items-center gap-2 pt-10 text-muted-foreground" role="status">
					<Loader2Icon className="size-5 animate-spin" /> Loading event…
				</p>
			</PageShell>
		);
	return (
		<AdminForm
			key={`${snapshot.event.slug}`}
			slug={slug}
			secret={secret}
			event={snapshot.event}
			responses={snapshot.responses}
			onSaved={(s) => setSnapshot(s)}
			refetch={refetch}
		/>
	);
}

interface FormState {
	title: string;
	dates: IsoDate[];
	window: DailyWindow;
	duration: MeetingDuration;
}

const fromEvent = (e: EventDto): FormState => ({
	title: e.title,
	dates: e.dates,
	window: e.window,
	duration: e.durationMinutes,
});

function AdminForm({
	slug,
	secret,
	event,
	responses,
	onSaved,
	refetch,
}: {
	slug: string;
	secret: string;
	event: EventDto;
	responses: ResponseDto[];
	onSaved: (s: EventSnapshot) => void;
	refetch: () => Promise<void>;
}) {
	const [form, setForm] = useState<FormState>(() => fromEvent(event));
	const [saving, setSaving] = useState(false);
	const [titleError, setTitleError] = useState<string | null>(null);
	const titleId = useId();

	// Keep the link-preview image in step with the title and dates (ADR 0018): draw it when it's
	// missing (events from before ADR 0018) or shows an old title or dates (after a save).
	const datesKey = event.dates.join(",");
	useEffect(() => {
		void import("@/lib/og-image").then((m) => m.ensureOgImage(event, secret));
	}, [event.slug, event.title, datesKey, event.creatorZone, secret]);

	// When someone else's save changes the event, reset the form only if it has no local edits.
	const [base, setBase] = useState(event);
	useEffect(() => {
		if (event === base) return;
		const untouched = JSON.stringify(fromEvent(base)) === JSON.stringify(form);
		setBase(event);
		if (untouched) setForm(fromEvent(event));
	}, [event, base, form]);

	const changed: PatchEventInput = useMemo(() => {
		const p: PatchEventInput = {};
		if (form.title.trim() !== event.title) p.title = form.title.trim();
		if (JSON.stringify(form.dates) !== JSON.stringify(event.dates)) p.dates = form.dates;
		if (form.window.start !== event.window.start || form.window.end !== event.window.end) p.window = form.window;
		if (form.duration !== event.durationMinutes) p.durationMinutes = form.duration;
		return p;
	}, [form, event]);
	const hasChanges = Object.keys(changed).length > 0;

	// How many responses would lose painted slots (ADR 0007).
	const affected = useMemo(() => {
		if (!changed.dates && !changed.window) return [];
		if (form.dates.length === 0) return responses.map((r) => r.name);
		try {
			const next = new Set(allSlots(generateColumns({ dates: form.dates, window: form.window, zone: event.creatorZone })));
			return responses
				.filter((r) => r.available.some((s) => !next.has(s)) || r.ifNeeded.some((s) => !next.has(s)))
				.map((r) => r.name);
		} catch {
			return [];
		}
	}, [changed.dates, changed.window, form.dates, form.window, event.creatorZone, responses]);

	const save = async () => {
		if (!form.title.trim()) {
			setTitleError("The event needs a name.");
			return;
		}
		if (form.dates.length === 0) {
			toast.error("Pick at least one date");
			return;
		}
		setSaving(true);
		try {
			const result = await api.patchEvent(slug, secret, changed);
			onSaved(result.snapshot);
			setForm(fromEvent(result.snapshot.event));
			setBase(result.snapshot.event);
			toast.success(
				"Event updated",
				result.responsesAffected > 0
					? `${result.responsesAffected} ${result.responsesAffected === 1 ? "response" : "responses"} lost some painted times.`
					: undefined,
			);
		} catch (err) {
			toast.error("Couldn't save", errorMessage(err));
		} finally {
			setSaving(false);
		}
	};

	const removeResponse = async (r: ResponseDto) => {
		try {
			await api.deleteResponse(slug, r.nameKey, secret);
			await refetch();
			toast.success(`Deleted ${r.name}'s response`);
		} catch (err) {
			toast.error("Couldn't delete", errorMessage(err));
		}
	};

	const deleteEvent = async () => {
		try {
			await api.deleteEvent(slug, secret);
			adminSecret.set(slug, null);
			toast.success("Event deleted");
			navigate("/", { replace: true });
		} catch (err) {
			toast.error("Couldn't delete the event", errorMessage(err));
		}
	};

	return (
		<PageShell
			header={
				<Button asChild variant="ghost" size="sm">
					<a {...linkProps(eventPath(slug))}>
						<ArrowLeftIcon /> Back to event
					</a>
				</Button>
			}
		>
			<div className="grid max-w-3xl grid-cols-1 gap-6 pt-2">
				<div>
					<p className="text-sm font-medium text-primary">Manage event</p>
					<h1 className="text-3xl font-semibold tracking-tight break-words">{event.title}</h1>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Links</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-5">
						<CopyField label="Share link" value={eventUrl(slug)} />
						<CopyField
							label="Admin link (keep it private)"
							value={adminUrl(slug, secret)}
							hint="Anyone with this link can change or delete the event."
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Details</CardTitle>
						<CardDescription>
							Link <span className="font-mono">/{slug}</span> and time zone ({zoneCity(event.creatorZone)}) can't be changed.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid grid-cols-1 gap-6">
						<div className="grid gap-2">
							<Label htmlFor={titleId}>Event name</Label>
							<Input
								id={titleId}
								value={form.title}
								maxLength={80}
								onChange={(e) => {
									setForm({ ...form, title: e.target.value });
									setTitleError(null);
								}}
								aria-invalid={!!titleError}
							/>
							{titleError && <p className="text-sm text-destructive">{titleError}</p>}
						</div>
						<DatesField value={form.dates} onChange={(dates) => setForm({ ...form, dates })} />
						<WindowField
							value={form.window}
							onChange={(window) => setForm({ ...form, window })}
							creatorZone={event.creatorZone}
							previewDate={form.dates[0] ?? event.dates[0] ?? ""}
						/>
						<DurationField value={form.duration} onChange={(duration) => setForm({ ...form, duration })} />

						{affected.length > 0 && (
							<div role="alert" className="flex gap-2 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-foreground">
								<TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
								<p>
									{affected.length} of {responses.length} {responses.length === 1 ? "response" : "responses"} will lose
									painted times ({affected.slice(0, 5).join(", ")}
									{affected.length > 5 ? "…" : ""}). Times outside the new dates or window are removed.
								</p>
							</div>
						)}

						<div className="flex flex-wrap items-center gap-3">
							<Button onClick={() => void save()} disabled={!hasChanges || saving}>
								{saving && <Loader2Icon className="animate-spin" />}
								Save changes
							</Button>
							{hasChanges && (
								<Button variant="ghost" onClick={() => setForm(fromEvent(event))}>
									Undo changes
								</Button>
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Responses · {responses.length}</CardTitle>
					</CardHeader>
					<CardContent>
						{responses.length === 0 ? (
							<p className="text-sm text-muted-foreground">No responses yet.</p>
						) : (
							<ul className="divide-y">
								{responses.map((r) => (
									<li key={r.nameKey} className="flex items-center justify-between gap-3 py-2">
										<span className="min-w-0">
											<span className="block truncate font-medium">{r.name}</span>
											<span className="text-sm text-muted-foreground">
												{r.available.length} available · {r.ifNeeded.length} if needed
											</span>
										</span>
										<ConfirmButton
											label={`Delete ${r.name}'s response`}
											title={`Delete ${r.name}'s response?`}
											description="Their times disappear for everyone. This can't be undone."
											confirm="Delete response"
											onConfirm={() => removeResponse(r)}
											compact
										/>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card className="border-destructive/30">
					<CardHeader>
						<CardTitle>Delete event</CardTitle>
						<CardDescription>
							Removes the event and {responses.length === 1 ? "its 1 response" : `all ${responses.length} responses`} now. The link stops working. This can't be undone.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ConfirmButton
							label="Delete event"
							title={`Delete “${event.title}”?`}
							description={`The event and ${responses.length === 1 ? "its response" : `all ${responses.length} responses`} are deleted for everyone. This can't be undone.`}
							confirm="Delete event"
							onConfirm={deleteEvent}
						/>
					</CardContent>
				</Card>
			</div>
		</PageShell>
	);
}

function ConfirmButton({
	label,
	title,
	description,
	confirm,
	onConfirm,
	compact = false,
}: {
	label: string;
	title: string;
	description: string;
	confirm: string;
	onConfirm: () => Promise<void> | void;
	compact?: boolean;
}) {
	const [busy, setBusy] = useState(false);
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant={compact ? "ghost" : "destructive"}
					size={compact ? "icon-sm" : "default"}
					className={compact ? "text-destructive hover:text-destructive" : undefined}
					aria-label={compact ? label : undefined}
					disabled={busy}
				>
					<Trash2Icon />
					{!compact && label}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						onClick={async () => {
							setBusy(true);
							try {
								await onConfirm();
							} finally {
								setBusy(false);
							}
						}}
					>
						{confirm}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
