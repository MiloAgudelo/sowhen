// Polling merge (ADR 0009).

import type { ResponseDto } from "@/shared/types";

/**
 * Replace everyone's responses with the server's, except the one being edited locally (by nameKey),
 * whose local draft is kept. If the local draft's nameKey is null, return the server list as is.
 *
 * The draft takes the place of the server's response with the same nameKey, or is appended if the
 * server has none (a first answer not saved yet, or deleted by someone else meanwhile). With no
 * draft (`ownDraft === null`) the server list is returned as is.
 */
export function mergeResponses(
	server: ResponseDto[],
	ownNameKey: string | null,
	ownDraft: ResponseDto | null,
): ResponseDto[] {
	if (ownNameKey === null || ownDraft === null) return server.slice();
	const out: ResponseDto[] = [];
	let placed = false;
	for (const r of server) {
		if (r.nameKey !== ownNameKey) out.push(r);
		else if (!placed) {
			out.push(ownDraft);
			placed = true;
		}
	}
	if (!placed) out.push(ownDraft);
	return out;
}
