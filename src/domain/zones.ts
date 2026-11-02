// Canonical time-zone names (ADR 0016). Browsers disagree: Chromium reports old IANA names
// ("Asia/Katmandu", "Europe/Kiev"), Firefox and Safari the current ones. Aliases compute the same
// times, but we store and show the current name.
//
// The table comes from the IANA `backward` file, limited to renames and pure synonyms: an alias
// whose target is the same place under its current spelling, or a legacy country/US-style name for
// one zone. It deliberately leaves out the 2022+ cross-country merges in `backward` (e.g.
// Europe/Amsterdam → Europe/Brussels, Atlantic/Reykjavik → Africa/Abidjan): those zones keep their
// own city names here, as they do in every browser.
import type { ZoneId } from "@/shared/types";

const UTC_ALIASES = [
	"Etc/UTC",
	"Etc/UCT",
	"Etc/Universal",
	"Etc/Zulu",
	"Etc/GMT",
	"Etc/GMT0",
	"Etc/GMT+0",
	"Etc/GMT-0",
	"Etc/Greenwich",
	"GMT",
	"GMT0",
	"GMT+0",
	"GMT-0",
	"Greenwich",
	"UCT",
	"Universal",
	"Zulu",
] as const;

/** Old or synonym zone name → current IANA name. */
export const ZONE_ALIASES: ReadonlyMap<string, ZoneId> = new Map<string, ZoneId>([
	// Africa
	["Africa/Asmera", "Africa/Asmara"],
	["Africa/Timbuktu", "Africa/Bamako"],
	// America
	["America/Argentina/ComodRivadavia", "America/Argentina/Catamarca"],
	["America/Atka", "America/Adak"],
	["America/Buenos_Aires", "America/Argentina/Buenos_Aires"],
	["America/Catamarca", "America/Argentina/Catamarca"],
	["America/Coral_Harbour", "America/Atikokan"],
	["America/Cordoba", "America/Argentina/Cordoba"],
	["America/Ensenada", "America/Tijuana"],
	["America/Fort_Wayne", "America/Indiana/Indianapolis"],
	["America/Godthab", "America/Nuuk"],
	["America/Indianapolis", "America/Indiana/Indianapolis"],
	["America/Jujuy", "America/Argentina/Jujuy"],
	["America/Knox_IN", "America/Indiana/Knox"],
	["America/Louisville", "America/Kentucky/Louisville"],
	["America/Mendoza", "America/Argentina/Mendoza"],
	["America/Porto_Acre", "America/Rio_Branco"],
	["America/Rosario", "America/Argentina/Cordoba"],
	["America/Santa_Isabel", "America/Tijuana"],
	["America/Shiprock", "America/Denver"],
	["America/Virgin", "America/St_Thomas"],
	// Antarctica
	["Antarctica/South_Pole", "Antarctica/McMurdo"],
	// Asia
	["Asia/Ashkhabad", "Asia/Ashgabat"],
	["Asia/Calcutta", "Asia/Kolkata"],
	["Asia/Chongqing", "Asia/Shanghai"],
	["Asia/Chungking", "Asia/Shanghai"],
	["Asia/Dacca", "Asia/Dhaka"],
	["Asia/Harbin", "Asia/Shanghai"],
	["Asia/Istanbul", "Europe/Istanbul"],
	["Asia/Kashgar", "Asia/Urumqi"],
	["Asia/Katmandu", "Asia/Kathmandu"],
	["Asia/Macao", "Asia/Macau"],
	["Asia/Rangoon", "Asia/Yangon"],
	["Asia/Saigon", "Asia/Ho_Chi_Minh"],
	["Asia/Tel_Aviv", "Asia/Jerusalem"],
	["Asia/Thimbu", "Asia/Thimphu"],
	["Asia/Ujung_Pandang", "Asia/Makassar"],
	["Asia/Ulan_Bator", "Asia/Ulaanbaatar"],
	// Atlantic
	["Atlantic/Faeroe", "Atlantic/Faroe"],
	// Australia
	["Australia/ACT", "Australia/Sydney"],
	["Australia/Canberra", "Australia/Sydney"],
	["Australia/Currie", "Australia/Hobart"],
	["Australia/LHI", "Australia/Lord_Howe"],
	["Australia/NSW", "Australia/Sydney"],
	["Australia/North", "Australia/Darwin"],
	["Australia/Queensland", "Australia/Brisbane"],
	["Australia/South", "Australia/Adelaide"],
	["Australia/Tasmania", "Australia/Hobart"],
	["Australia/Victoria", "Australia/Melbourne"],
	["Australia/West", "Australia/Perth"],
	["Australia/Yancowinna", "Australia/Broken_Hill"],
	// Brazil, Canada, Chile, Mexico, US
	["Brazil/Acre", "America/Rio_Branco"],
	["Brazil/DeNoronha", "America/Noronha"],
	["Brazil/East", "America/Sao_Paulo"],
	["Brazil/West", "America/Manaus"],
	["Canada/Atlantic", "America/Halifax"],
	["Canada/Central", "America/Winnipeg"],
	["Canada/Eastern", "America/Toronto"],
	["Canada/Mountain", "America/Edmonton"],
	["Canada/Newfoundland", "America/St_Johns"],
	["Canada/Pacific", "America/Vancouver"],
	["Canada/Saskatchewan", "America/Regina"],
	["Canada/Yukon", "America/Whitehorse"],
	["Chile/Continental", "America/Santiago"],
	["Chile/EasterIsland", "Pacific/Easter"],
	["Mexico/BajaNorte", "America/Tijuana"],
	["Mexico/BajaSur", "America/Mazatlan"],
	["Mexico/General", "America/Mexico_City"],
	["US/Alaska", "America/Anchorage"],
	["US/Aleutian", "America/Adak"],
	["US/Arizona", "America/Phoenix"],
	["US/Central", "America/Chicago"],
	["US/East-Indiana", "America/Indiana/Indianapolis"],
	["US/Eastern", "America/New_York"],
	["US/Hawaii", "Pacific/Honolulu"],
	["US/Indiana-Starke", "America/Indiana/Knox"],
	["US/Michigan", "America/Detroit"],
	["US/Mountain", "America/Denver"],
	["US/Pacific", "America/Los_Angeles"],
	["US/Samoa", "Pacific/Pago_Pago"],
	// Europe
	["Europe/Belfast", "Europe/London"],
	["Europe/Kiev", "Europe/Kyiv"],
	["Europe/Nicosia", "Asia/Nicosia"],
	["Europe/Tiraspol", "Europe/Chisinau"],
	// Pacific
	["Pacific/Enderbury", "Pacific/Kanton"],
	["Pacific/Johnston", "Pacific/Honolulu"],
	["Pacific/Ponape", "Pacific/Pohnpei"],
	["Pacific/Samoa", "Pacific/Pago_Pago"],
	["Pacific/Truk", "Pacific/Chuuk"],
	["Pacific/Yap", "Pacific/Chuuk"],
	// Country-name zones
	["Cuba", "America/Havana"],
	["Egypt", "Africa/Cairo"],
	["Eire", "Europe/Dublin"],
	["GB", "Europe/London"],
	["GB-Eire", "Europe/London"],
	["Hongkong", "Asia/Hong_Kong"],
	["Iceland", "Atlantic/Reykjavik"],
	["Iran", "Asia/Tehran"],
	["Israel", "Asia/Jerusalem"],
	["Jamaica", "America/Jamaica"],
	["Japan", "Asia/Tokyo"],
	["Kwajalein", "Pacific/Kwajalein"],
	["Libya", "Africa/Tripoli"],
	["Navajo", "America/Denver"],
	["NZ", "Pacific/Auckland"],
	["NZ-CHAT", "Pacific/Chatham"],
	["Poland", "Europe/Warsaw"],
	["Portugal", "Europe/Lisbon"],
	["PRC", "Asia/Shanghai"],
	["ROC", "Asia/Taipei"],
	["ROK", "Asia/Seoul"],
	["Singapore", "Asia/Singapore"],
	["Turkey", "Europe/Istanbul"],
	["W-SU", "Europe/Moscow"],
	// UTC (ECMA-402 also canonicalises these to "UTC")
	...UTC_ALIASES.map((a) => [a, "UTC"] as [string, ZoneId]),
]);

const runtimeKnows = new Map<ZoneId, boolean>();
function isKnownToRuntime(zone: ZoneId): boolean {
	let ok = runtimeKnows.get(zone);
	if (ok === undefined) {
		try {
			new Intl.DateTimeFormat("en", { timeZone: zone });
			ok = true;
		} catch {
			ok = false;
		}
		runtimeKnows.set(zone, ok);
	}
	return ok;
}

/**
 * The current IANA name of a zone: "Asia/Katmandu" → "Asia/Kathmandu", "US/Eastern" →
 * "America/New_York", "Etc/UTC" → "UTC". Anything not in the alias table comes back unchanged.
 * If the runtime's time-zone data is too old to know the current name (e.g. "Europe/Kyiv" before
 * tzdata 2022b), the alias is kept, so the result always works with Intl and Temporal.
 */
export function canonicalZone(zone: ZoneId): ZoneId {
	const current = ZONE_ALIASES.get(zone);
	if (current === undefined) return zone;
	return isKnownToRuntime(current) ? current : zone;
}
