// HTTP contract. The Worker implements it (src/worker); the browser calls it (src/lib/api-client.ts).
// All bodies are JSON. All /api responses carry `Cache-Control: no-store`.
// Errors: `{ error: ApiErrorCode, message: string }` with the status listed per route.

import type {
	DailyWindow,
	EventDto,
	EventSnapshot,
	IsoDate,
	MeetingDuration,
	ResponseDto,
	SlotId,
	ZoneId,
} from "./types";

export type ApiErrorCode =
	| "bad_request" // 400: validation failed
	| "slug_taken" // 409
	| "slug_invalid" // 400: format or reserved
	| "not_found" // 404: unknown or expired event (never says which, ADR 0008)
	| "forbidden"; // 403: wrong or missing admin secret

export interface ApiError {
	error: ApiErrorCode;
	message: string;
}

/** Header carrying the admin secret (taken from the admin link's URL fragment, ADR 0007). */
export const ADMIN_HEADER = "X-Sowhen-Admin";

/**
 * Header on PUT /api/events/:slug/og-image: what the image shows, as
 * encodeURIComponent(JSON.stringify({ title, dates })). The upload is refused if the event has
 * changed since (ADR 0018).
 */
export const OG_DRAWN_FOR_HEADER = "X-Sowhen-Drawn-For";

/** Query parameter carrying the client's known version for polling (ADR 0009). */
export const VERSION_PARAM = "v";

// ---- GET /api/slugs/:slug → 200 SlugCheck
export interface SlugCheck {
	slug: string;
	available: boolean;
	/** Present when taken or invalid: a free alternative, e.g. "comms-weekly-2". */
	suggestion?: string;
	/** Present when invalid. */
	reason?: "format" | "reserved";
}

// ---- POST /api/events  body CreateEventInput → 201 CreateEventResult | 400 | 409
export interface CreateEventInput {
	slug: string;
	title: string;
	creatorZone: ZoneId;
	dates: IsoDate[];
	window: DailyWindow;
	durationMinutes: MeetingDuration;
}
export interface CreateEventResult {
	event: EventDto;
	/** Shown once; the browser builds `/<slug>/admin#<adminSecret>`. Server stores only a hash. */
	adminSecret: string;
}

// ---- GET /api/events/:slug?v=<version> → 200 EventSnapshot | 304 (no body) | 404

// ---- PUT /api/events/:slug/responses  body PutResponseInput → 200 PutResponseResult | 400 | 404
// Upsert keyed by normalised name (ADR 0005). Slots not in the event are rejected (400).
export interface PutResponseInput {
	name: string;
	available: SlotId[];
	ifNeeded: SlotId[];
}
export interface PutResponseResult {
	response: ResponseDto;
	version: number;
}

// ---- DELETE /api/events/:slug/responses/:nameKey → 204 | 404
// Anyone with the link may delete (ADR 0005). nameKey is URL-encoded.

// ---- GET /api/events/:slug/admin  (header ADMIN_HEADER) → 204 | 403 | 404
// Lets the admin page check the secret before showing controls.

// ---- PATCH /api/events/:slug  (header ADMIN_HEADER) body PatchEventInput → 200 PatchEventResult | 400 | 403 | 404
// Changing dates/window regenerates columns; response slots no longer in the event are dropped.
export interface PatchEventInput {
	title?: string;
	dates?: IsoDate[];
	window?: DailyWindow;
	durationMinutes?: MeetingDuration;
}
export interface PatchEventResult {
	snapshot: EventSnapshot;
	/** How many responses lost at least one slot because of this change. */
	responsesAffected: number;
}

// ---- PUT /api/events/:slug/og-image  (headers ADMIN_HEADER, OG_DRAWN_FOR_HEADER)
//      body: a 1200×630 JPEG (Content-Type image/jpeg, ≤ OG_IMAGE_MAX_BYTES) → 204 | 400 | 403 | 404
// ---- GET|HEAD /api/events/:slug/og-image[?k=<key>] → 200 image/jpeg | 404 (none, stale or expired)
//      The link preview's og:image (ADR 0018). Cached for a day when `k` matches the current image.

// ---- DELETE /api/events/:slug  (header ADMIN_HEADER) → 204 | 403 | 404

// ---- DELETE /api/events/:slug/responses/:nameKey is also how the admin removes a response.

// Scheduled handler (cron "17 3 * * *"): delete events where expires_at < now, with their responses.
