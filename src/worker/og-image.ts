// Per-event preview images (ADR 0018): the JPEG check and storage helpers. Pure except for the SQL
// string, so it runs in Vitest.

/**
 * Width and height of a baseline or progressive JPEG, read from its first SOF marker. Returns null for
 * anything that isn't a well-formed JPEG up to that marker (so an upload can't be HTML or SVG wearing
 * an image/jpeg label).
 */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let i = 2;
	while (i + 4 <= bytes.length) {
		if (bytes[i] !== 0xff) return null;
		const marker = bytes[i + 1] ?? 0;
		if (marker === 0xff) {
			i++; // fill byte
			continue;
		}
		// Standalone markers carry no length.
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			i += 2;
			continue;
		}
		if (marker === 0xd9 || marker === 0xda) return null; // end of image or scan before any SOF
		const length = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
		if (length < 2) return null;
		// SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			if (i + 9 > bytes.length) return null;
			const height = ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0);
			const width = ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0);
			return { width, height };
		}
		i += 2 + length;
	}
	return null;
}

/** D1 returns BLOBs as ArrayBuffer (or number[] in older runtimes); node:sqlite as Uint8Array. */
export function blobBytes(value: unknown): Uint8Array | null {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (Array.isArray(value)) return Uint8Array.from(value as number[]);
	return null;
}

/** Short cache key for an image's URL (`?k=`), from its upload time. */
export function imageKey(updatedAt: string): string {
	const ms = Date.parse(updatedAt);
	return Number.isFinite(ms) ? ms.toString(36) : "0";
}

/**
 * The current image of a live event, only if it still shows the event's title and dates.
 * Bind (slug, nowIso).
 */
export const FRESH_IMAGE_SQL =
	"SELECT o.image AS image, o.updated_at AS updated_at FROM og_images o JOIN events e ON e.slug = o.event_slug " +
	"WHERE o.event_slug = ? AND e.expires_at > ? AND o.drawn_title = e.title AND o.drawn_dates = e.dates";
