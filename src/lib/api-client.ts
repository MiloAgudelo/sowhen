// Typed fetch wrapper for every route in src/shared/api.ts.
import {
	ADMIN_HEADER,
	type ApiError,
	type ApiErrorCode,
	type CreateEventInput,
	type CreateEventResult,
	type PatchEventInput,
	type PatchEventResult,
	type PutResponseInput,
	type PutResponseResult,
	type SlugCheck,
	VERSION_PARAM,
} from "@/shared/api";
import { canonicalZone } from "@/domain/zones";
import type { EventDto, EventSnapshot } from "@/shared/types";

export class ApiRequestError extends Error {
	readonly status: number;
	/** null when the server didn't send a JSON error body (network error, 5xx from the platform…). */
	readonly code: ApiErrorCode | null;

	constructor(status: number, code: ApiErrorCode | null, message: string) {
		super(message);
		this.name = "ApiRequestError";
		this.status = status;
		this.code = code;
	}

	get isNotFound() {
		return this.status === 404;
	}
	get isForbidden() {
		return this.status === 403;
	}
}

const enc = encodeURIComponent;

interface RequestOptions {
	method?: string;
	body?: unknown;
	adminSecret?: string;
	signal?: AbortSignal;
}

async function request(path: string, { method = "GET", body, adminSecret, signal }: RequestOptions = {}) {
	const headers: Record<string, string> = { Accept: "application/json" };
	if (body !== undefined) headers["Content-Type"] = "application/json";
	if (adminSecret) headers[ADMIN_HEADER] = adminSecret;
	let res: Response;
	try {
		res = await fetch(path, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			cache: "no-store",
			signal,
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") throw err;
		throw new ApiRequestError(0, null, "Can't reach sowhen. Check your connection.");
	}
	if (res.status === 304 || res.ok) return res;
	let payload: Partial<ApiError> = {};
	try {
		payload = (await res.json()) as Partial<ApiError>;
	} catch {
		// not JSON
	}
	throw new ApiRequestError(res.status, payload.error ?? null, payload.message ?? `Request failed (${res.status})`);
}

async function json<T>(res: Response): Promise<T> {
	return (await res.json()) as T;
}

/**
 * Events created before ADR 0016 may store an old zone name ("Asia/Katmandu"). Canonicalise it as
 * it arrives, so every display path and every zone comparison sees the current name.
 */
function withCanonicalZone<T extends { event: EventDto }>(value: T): T {
	const creatorZone = canonicalZone(value.event.creatorZone);
	return creatorZone === value.event.creatorZone ? value : { ...value, event: { ...value.event, creatorZone } };
}

export const api = {
	/** GET /api/slugs/:slug */
	async checkSlug(slug: string, signal?: AbortSignal): Promise<SlugCheck> {
		return json(await request(`/api/slugs/${enc(slug)}`, { signal }));
	},

	/** POST /api/events */
	async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
		return withCanonicalZone(await json<CreateEventResult>(await request("/api/events", { method: "POST", body: input })));
	},

	/**
	 * GET /api/events/:slug?v=<version>. Returns null on 304 (nothing changed since `version`).
	 * Throws ApiRequestError with status 404 for unknown or expired events.
	 */
	async getEvent(slug: string, version?: number | null, signal?: AbortSignal): Promise<EventSnapshot | null> {
		const q = version != null ? `?${VERSION_PARAM}=${enc(String(version))}` : "";
		const res = await request(`/api/events/${enc(slug)}${q}`, { signal });
		if (res.status === 304) return null;
		return withCanonicalZone(await json<EventSnapshot>(res));
	},

	/** PUT /api/events/:slug/responses */
	async putResponse(slug: string, input: PutResponseInput): Promise<PutResponseResult> {
		return json(await request(`/api/events/${enc(slug)}/responses`, { method: "PUT", body: input }));
	},

	/** DELETE /api/events/:slug/responses/:nameKey (anyone with the link, or the admin). */
	async deleteResponse(slug: string, nameKey: string, adminSecret?: string): Promise<void> {
		await request(`/api/events/${enc(slug)}/responses/${enc(nameKey)}`, { method: "DELETE", adminSecret });
	},

	/** GET /api/events/:slug/admin → resolves if the secret is right; throws 403/404 otherwise. */
	async verifyAdmin(slug: string, adminSecret: string, signal?: AbortSignal): Promise<void> {
		await request(`/api/events/${enc(slug)}/admin`, { adminSecret, signal });
	},

	/** PATCH /api/events/:slug */
	async patchEvent(slug: string, adminSecret: string, input: PatchEventInput): Promise<PatchEventResult> {
		const result = await json<PatchEventResult>(
			await request(`/api/events/${enc(slug)}`, { method: "PATCH", body: input, adminSecret }),
		);
		return { ...result, snapshot: withCanonicalZone(result.snapshot) };
	},

	/** DELETE /api/events/:slug */
	async deleteEvent(slug: string, adminSecret: string): Promise<void> {
		await request(`/api/events/${enc(slug)}`, { method: "DELETE", adminSecret });
	},
};

/** A friendly message for any error thrown by `api`. */
export function errorMessage(err: unknown): string {
	if (err instanceof ApiRequestError) {
		if (err.status === 0) return err.message;
		if (err.code === "slug_taken") return "That link is already taken. Try another.";
		if (err.code === "slug_invalid") return "That link can't be used. Use letters, numbers and hyphens.";
		if (err.code === "forbidden") return "This admin link isn't valid for this event.";
		if (err.code === "not_found") return "This event doesn't exist or has expired.";
		return err.message || "Something went wrong. Please try again.";
	}
	return "Something went wrong. Please try again.";
}
