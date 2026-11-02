// Live updates by in-place polling (ADR 0009).
// - 15 s while the tab is visible; sends the known version as ?v= and keeps state on 304.
// - Pauses while hidden; fetches immediately when the tab becomes visible again.
// - Backs off to 60 s after ~10 min with no user input.
// - `refetch()` after a save.
// - The viewer's own unsaved draft survives: `responses` is mergeResponses(server, ownNameKey, draft).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeResponses } from "@/domain";
import { ApiRequestError, api } from "@/lib/api-client";
import type { EventSnapshot, ResponseDto } from "@/shared/types";

export const POLL_ACTIVE_MS = 15_000;
export const POLL_IDLE_MS = 60_000;
export const IDLE_AFTER_MS = 10 * 60_000;

export type SnapshotStatus = "loading" | "ready" | "notFound" | "error";

export interface OwnDraft {
	/** Normalised name of the response being edited. */
	nameKey: string;
	/** The local, possibly unsaved, version of that response. */
	response: ResponseDto;
}

export interface UseEventSnapshotResult {
	status: SnapshotStatus;
	/** The last snapshot from the server (without the local draft). */
	snapshot: EventSnapshot | null;
	/** Server responses merged with the local draft. Use this for the heatmap and best times. */
	responses: ResponseDto[];
	/** Set when the last poll failed (the old snapshot stays on screen). */
	error: ApiRequestError | null;
	/** Fetch now (e.g. right after saving). Resolves when done. */
	refetch: () => Promise<void>;
	/** Replace the snapshot with one the server just returned (e.g. from PATCH). */
	setSnapshot: (s: EventSnapshot) => void;
}

export function useEventSnapshot(slug: string, draft: OwnDraft | null = null): UseEventSnapshotResult {
	const [snapshot, setSnapshotState] = useState<EventSnapshot | null>(null);
	const [status, setStatus] = useState<SnapshotStatus>("loading");
	const [error, setError] = useState<ApiRequestError | null>(null);

	const versionRef = useRef<number | null>(null);
	const inFlight = useRef<Promise<void> | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const lastInput = useRef(Date.now());
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const alive = useRef(true);

	const setSnapshot = useCallback((s: EventSnapshot) => {
		versionRef.current = s.version;
		setSnapshotState(s);
		setStatus("ready");
	}, []);

	const fetchOnce = useCallback((): Promise<void> => {
		if (inFlight.current) return inFlight.current;
		const ctrl = new AbortController();
		abortRef.current = ctrl;
		let p: Promise<void> | null = null;
		p = (async () => {
			try {
				const next = await api.getEvent(slug, versionRef.current, ctrl.signal);
				if (!alive.current) return;
				setError(null);
				if (next) {
					versionRef.current = next.version;
					setSnapshotState(next);
				}
				setStatus("ready");
			} catch (err) {
				if (!alive.current || ctrl.signal.aborted) return;
				if (err instanceof ApiRequestError && err.status === 404) {
					// Unknown, expired or just deleted: one generic page (ADR 0008).
					setStatus("notFound");
					setSnapshotState(null);
					return;
				}
				const e = err instanceof ApiRequestError ? err : new ApiRequestError(0, null, "Can't reach sowhen.");
				setError(e);
				setStatus((s) => (s === "loading" ? "error" : s));
			} finally {
				if (inFlight.current === p) inFlight.current = null;
			}
		})();
		inFlight.current = p;
		return p;
	}, [slug]);

	const schedule = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		if (!alive.current || document.visibilityState === "hidden") return;
		const idle = Date.now() - lastInput.current > IDLE_AFTER_MS;
		timer.current = setTimeout(async () => {
			await fetchOnce();
			schedule();
		}, idle ? POLL_IDLE_MS : POLL_ACTIVE_MS);
	}, [fetchOnce]);

	// Initial load + polling loop, reset when the slug changes.
	useEffect(() => {
		alive.current = true;
		versionRef.current = null;
		setSnapshotState(null);
		setStatus("loading");
		setError(null);
		lastInput.current = Date.now();
		void fetchOnce().then(schedule);

		const onVisibility = () => {
			if (document.visibilityState === "visible") {
				void fetchOnce().then(schedule);
			} else if (timer.current) {
				clearTimeout(timer.current);
				timer.current = null;
			}
		};
		const onInput = () => {
			const wasIdle = Date.now() - lastInput.current > IDLE_AFTER_MS;
			lastInput.current = Date.now();
			// Coming back from idle: don't wait out the 60 s timer.
			if (wasIdle) void fetchOnce().then(schedule);
		};
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("pointerdown", onInput, { passive: true });
		window.addEventListener("keydown", onInput);
		window.addEventListener("wheel", onInput, { passive: true });
		return () => {
			alive.current = false;
			if (timer.current) clearTimeout(timer.current);
			timer.current = null;
			abortRef.current?.abort();
			inFlight.current = null;
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("pointerdown", onInput);
			window.removeEventListener("keydown", onInput);
			window.removeEventListener("wheel", onInput);
		};
	}, [fetchOnce, schedule]);

	const refetch = useCallback(async () => {
		lastInput.current = Date.now();
		// A poll may be in flight with the old version; wait for it, then ask again.
		if (inFlight.current) await inFlight.current;
		await fetchOnce();
		schedule();
	}, [fetchOnce, schedule]);

	const responses = useMemo(() => {
		if (!snapshot) return [];
		return mergeResponses(snapshot.responses, draft?.nameKey ?? null, draft?.response ?? null);
	}, [snapshot, draft]);

	return { status, snapshot, responses, error, refetch, setSnapshot };
}
