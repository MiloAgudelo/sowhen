// Time-zone helpers for the UI. Offset formatting and slot maths live in src/domain.
import type { SlotId, ZoneId } from "@/shared/types";

export function browserZone(): ZoneId {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

export function isValidZone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat("en", { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

let cachedZones: ZoneId[] | null = null;
/** Every IANA zone the browser knows, plus the browser's own zone (it can be an alias missing from the list). */
export function allZones(): ZoneId[] {
	if (!cachedZones) {
		let list: string[] = [];
		try {
			list = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
		} catch {
			list = [];
		}
		const set = new Set(list);
		set.add(browserZone());
		set.add("UTC");
		cachedZones = [...set].sort();
	}
	return cachedZones;
}

// Accented city names that IANA spells in ASCII.
const CITY_OVERRIDES: Record<string, string> = {
	"America/Bogota": "Bogotá",
	"America/Sao_Paulo": "São Paulo",
	"America/Mexico_City": "Mexico City",
	"America/Asuncion": "Asunción",
	"America/Merida": "Mérida",
	"America/Cancun": "Cancún",
	"America/Mazatlan": "Mazatlán",
	"America/Belem": "Belém",
	"America/Maceio": "Maceió",
	"America/Cuiaba": "Cuiabá",
	"America/Araguaina": "Araguaína",
	"America/Bahia_Banderas": "Bahía de Banderas",
	"America/Curacao": "Curaçao",
	"Europe/Zurich": "Zürich",
	"Europe/Chisinau": "Chișinău",
	"Asia/Ho_Chi_Minh": "Ho Chi Minh City",
	"Asia/Kolkata": "Kolkata",
	"Asia/Calcutta": "Kolkata",
	// Chromium's ICU lists (and resolves the browser zone to) the old IANA names of these zones.
	// Show and search them by today's city name.
	"Asia/Katmandu": "Kathmandu",
	"Asia/Saigon": "Ho Chi Minh City",
	"Asia/Rangoon": "Yangon",
	"Europe/Kiev": "Kyiv",
	"America/Godthab": "Nuuk",
	"Asia/Ulan_Bator": "Ulaanbaatar",
	"Atlantic/Faeroe": "Faroe",
	"Pacific/Truk": "Chuuk",
	"Pacific/Ponape": "Pohnpei",
	"Atlantic/Reykjavik": "Reykjavík",
	"Africa/Lome": "Lomé",
	"Africa/Sao_Tome": "São Tomé",
	"Pacific/Noumea": "Nouméa",
	UTC: "UTC",
	"Etc/UTC": "UTC",
};

/** Short human name for a zone: "Europe/Warsaw" → "Warsaw", "America/Bogota" → "Bogotá". */
export function zoneCity(zone: ZoneId): string {
	const o = CITY_OVERRIDES[zone];
	if (o) return o;
	const last = zone.split("/").pop() ?? zone;
	return last.replace(/_/g, " ");
}

/** Region prefix, e.g. "Europe", "America/Argentina". */
export function zoneRegion(zone: ZoneId): string {
	const parts = zone.split("/");
	return parts.slice(0, -1).join("/").replace(/_/g, " ");
}

/** Long generic zone name from Intl, e.g. "Central European Time". */
export function zoneLongName(zone: ZoneId, at: Date = new Date()): string {
	try {
		const parts = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longGeneric" }).formatToParts(at);
		return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
	} catch {
		return "";
	}
}

/** Offset in minutes (east positive) of a zone at an instant. Self-contained so lists can sort before domain lands. */
export function zoneOffsetMinutes(zone: ZoneId, at: Date = new Date()): number {
	try {
		const parts = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at);
		const v = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
		const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(v);
		if (!m) return 0;
		const sign = m[1] === "-" ? -1 : 1;
		return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
	} catch {
		return 0;
	}
}

/** "UTC+2", "UTC−5", "UTC+5:45" (U+2212 minus), for list items. Prefer domain.formatUtcOffset for slots. */
export function offsetLabel(minutes: number): string {
	if (minutes === 0) return "UTC";
	const sign = minutes < 0 ? "−" : "+";
	const abs = Math.abs(minutes);
	const h = Math.floor(abs / 60);
	const m = abs % 60;
	return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

// ---- Formatting slots (epoch minutes) in a zone

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: ZoneId, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = zone + JSON.stringify(opts);
	let f = fmtCache.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...opts });
		fmtCache.set(key, f);
	}
	return f;
}

export const slotDate = (slot: SlotId) => new Date(slot * 60_000);

/** "15:00" */
export function formatTime(slot: SlotId, zone: ZoneId): string {
	const parts = fmt(zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(slotDate(slot));
	const h = parts.find((p) => p.type === "hour")?.value ?? "00";
	const m = parts.find((p) => p.type === "minute")?.value ?? "00";
	return `${h}:${m}`;
}

/** "Tue" */
export function formatWeekday(slot: SlotId, zone: ZoneId): string {
	return new Intl.DateTimeFormat("en", { timeZone: zone, weekday: "short" }).format(slotDate(slot));
}

/** "Tue 9 Nov" */
export function formatDay(slot: SlotId, zone: ZoneId): string {
	const d = slotDate(slot);
	const wd = new Intl.DateTimeFormat("en", { timeZone: zone, weekday: "short" }).format(d);
	const dm = new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "numeric", month: "short" }).format(d);
	return `${wd} ${dm}`;
}

/** Viewer-local calendar date of an instant, "YYYY-MM-DD". */
export function isoDateIn(slot: SlotId, zone: ZoneId): string {
	const parts = fmt(zone, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(slotDate(slot));
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Format an event date ("YYYY-MM-DD", no zone) like "Tue 9 Nov". */
export function formatIsoDate(iso: string, opts: { year?: boolean } = {}): string {
	const d = new Date(`${iso}T12:00:00Z`);
	const wd = new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "short" }).format(d);
	const dm = new Intl.DateTimeFormat("en-GB", {
		timeZone: "UTC",
		day: "numeric",
		month: "short",
		...(opts.year ? { year: "numeric" } : {}),
	}).format(d);
	return `${wd} ${dm}`;
}

/**
 * Range in a zone: "15:00–16:00", with "+1" on the end when it falls on the next local day, or the
 * end's weekday when further apart.
 */
export function formatRange(start: SlotId, end: SlotId, zone: ZoneId): string {
	const a = formatTime(start, zone);
	const b = formatTime(end, zone);
	const da = isoDateIn(start, zone);
	const db = isoDateIn(end - 1, zone);
	const endDay = isoDateIn(end, zone);
	// An end exactly at midnight reads as 24:00 rather than "00:00 +1".
	if (b === "00:00" && db === da) return `${a}–24:00`;
	if (endDay === da) return `${a}–${b}`;
	return `${a}–${b} +1`;
}

/** Today's date in a zone, "YYYY-MM-DD". */
export function todayIn(zone: ZoneId): string {
	return isoDateIn(Math.floor(Date.now() / 60_000), zone);
}
