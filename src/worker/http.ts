// Response helpers. Every /api response carries `Cache-Control: no-store` (src/shared/api.ts).
import type { ApiErrorCode } from "@/shared/api";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json(body: unknown, status = 200): Response {
	return Response.json(body, { status, headers: NO_STORE });
}

export function noContent(): Response {
	return new Response(null, { status: 204, headers: NO_STORE });
}

export function notModified(): Response {
	return new Response(null, { status: 304, headers: NO_STORE });
}

const STATUS: Record<ApiErrorCode, number> = {
	bad_request: 400,
	slug_invalid: 400,
	slug_taken: 409,
	not_found: 404,
	forbidden: 403,
};

export function apiError(error: ApiErrorCode, message: string): Response {
	return json({ error, message }, STATUS[error]);
}

/** Thrown inside handlers to short-circuit with an API error. */
export class HttpError extends Error {
	constructor(
		readonly code: ApiErrorCode,
		message: string,
	) {
		super(message);
	}
}

export const notFound = () => new HttpError("not_found", "This event doesn't exist or has expired.");
export const badRequest = (message: string) => new HttpError("bad_request", message);

const MAX_BODY_BYTES = 64 * 1024;

/** Reads a JSON object body. Rejects non-objects, bad JSON and oversized bodies. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
	const length = Number(request.headers.get("Content-Length") ?? "0");
	if (length > MAX_BODY_BYTES) throw badRequest("Request body is too large.");
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) throw badRequest("Request body is too large.");
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw badRequest("Request body must be valid JSON.");
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw badRequest("Request body must be a JSON object.");
	}
	return value as Record<string, unknown>;
}
