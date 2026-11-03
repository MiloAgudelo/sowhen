// What a link preview says about an event (ADR 0015, ADR 0018), shared by the Worker (tags) and the
// browser (the per-event image), so the two always agree. No names, ever.

const DAY_MS = 86_400_000;

/**
 * The event dates as a short range. They're calendar dates in the creator zone, so they're formatted
 * as UTC midnights (formatting in a real zone could shift the day).
 *   one date            Tue 10 Nov
 *   consecutive dates   Tue 10 – Fri 14 Nov / Fri 28 Nov – Tue 2 Dec
 *   with gaps           3 dates, Tue 10 – Fri 14 Nov
 *   across a new year   Wed 30 Dec 2026 – Fri 1 Jan 2027
 */
export function formatDates(dates: string[]): string {
	const days = [...new Set(dates)]
		.map((d) => Date.parse(`${d}T00:00:00Z`))
		.filter((ms) => Number.isFinite(ms))
		.sort((a, b) => a - b);
	const first = days[0];
	const last = days.at(-1);
	if (first === undefined || last === undefined) return "";
	const part = (ms: number, opts: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(ms));
	const weekday = (ms: number) => part(ms, { weekday: "short" });
	const day = (ms: number) => part(ms, { day: "numeric" });
	const month = (ms: number) => part(ms, { month: "short" });
	const year = (ms: number) => part(ms, { year: "numeric" });

	if (first === last) return `${weekday(first)} ${day(first)} ${month(first)}`;
	let range: string;
	if (year(first) !== year(last)) {
		range = `${weekday(first)} ${day(first)} ${month(first)} ${year(first)} – ${weekday(last)} ${day(last)} ${month(last)} ${year(last)}`;
	} else if (month(first) !== month(last)) {
		range = `${weekday(first)} ${day(first)} ${month(first)} – ${weekday(last)} ${day(last)} ${month(last)}`;
	} else {
		range = `${weekday(first)} ${day(first)} – ${weekday(last)} ${day(last)} ${month(last)}`;
	}
	const consecutive = (last - first) / DAY_MS === days.length - 1;
	return consecutive ? range : `${days.length} dates, ${range}`;
}

/** The per-event preview image (ADR 0018). */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
/** Upload limit. A drawn 1200×630 JPEG at quality 0.85 is ~120–200 kB. */
export const OG_IMAGE_MAX_BYTES = 450 * 1024;
