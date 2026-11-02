// Shared helpers for the domain unit tests.

import type { ResponseDto, SlotId } from "@/shared/types";

/** Epoch minutes for a UTC wall time. Month is 1-based. */
export const utc = (y: number, mo: number, d: number, h = 0, mi = 0): SlotId => Date.UTC(y, mo - 1, d, h, mi) / 60_000;

export const ZONE_MATRIX = [
	"Europe/Warsaw",
	"Europe/London",
	"America/Bogota",
	"America/New_York",
	"America/Mexico_City",
	"Asia/Manila",
	"Asia/Kolkata",
	"Asia/Kathmandu",
	"Pacific/Auckland",
] as const;

export function response(name: string, available: SlotId[] = [], ifNeeded: SlotId[] = []): ResponseDto {
	return {
		name,
		nameKey: name.toLowerCase(),
		available,
		ifNeeded,
		updatedAt: "2027-01-01T00:00:00.000Z",
	};
}
