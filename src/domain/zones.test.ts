import { describe, expect, it } from "vitest";
import { canonicalZone, generateColumns, ZONE_ALIASES } from "@/domain";

const isZone = (z: string) => {
	try {
		new Intl.DateTimeFormat("en", { timeZone: z });
		return true;
	} catch {
		return false;
	}
};

describe("canonicalZone", () => {
	it("maps the old names Chromium reports to the current ones", () => {
		expect(canonicalZone("Asia/Katmandu")).toBe("Asia/Kathmandu");
		expect(canonicalZone("Asia/Calcutta")).toBe("Asia/Kolkata");
		expect(canonicalZone("Europe/Kiev")).toBe("Europe/Kyiv");
		expect(canonicalZone("Asia/Saigon")).toBe("Asia/Ho_Chi_Minh");
		expect(canonicalZone("Asia/Rangoon")).toBe("Asia/Yangon");
		expect(canonicalZone("America/Buenos_Aires")).toBe("America/Argentina/Buenos_Aires");
		expect(canonicalZone("America/Indianapolis")).toBe("America/Indiana/Indianapolis");
		expect(canonicalZone("America/Godthab")).toBe("America/Nuuk");
		expect(canonicalZone("Asia/Ulan_Bator")).toBe("Asia/Ulaanbaatar");
		expect(canonicalZone("Pacific/Ponape")).toBe("Pacific/Pohnpei");
		expect(canonicalZone("Pacific/Truk")).toBe("Pacific/Chuuk");
		expect(canonicalZone("Atlantic/Faeroe")).toBe("Atlantic/Faroe");
	});

	it("maps US/*, country names and UTC synonyms", () => {
		expect(canonicalZone("US/Eastern")).toBe("America/New_York");
		expect(canonicalZone("US/Pacific")).toBe("America/Los_Angeles");
		expect(canonicalZone("Poland")).toBe("Europe/Warsaw");
		expect(canonicalZone("GB")).toBe("Europe/London");
		for (const z of ["Etc/UTC", "Etc/GMT", "GMT", "UCT", "Etc/Universal", "Zulu"]) expect(canonicalZone(z)).toBe("UTC");
	});

	it("leaves current names, unknown names and prototype keys unchanged", () => {
		for (const z of ["Europe/Warsaw", "Asia/Kathmandu", "America/Bogota", "UTC", "Etc/GMT+5", "Mars/Olympus", "constructor"]) {
			expect(canonicalZone(z)).toBe(z);
		}
	});

	it("covers this list of aliases", () => {
		// ADR 0016: keep the table in sync with IANA renames. Update this snapshot when adding one.
		expect(ZONE_ALIASES.size).toBe(131);
	});

	it("only points at current names the runtime knows, and is idempotent", () => {
		for (const [alias, current] of ZONE_ALIASES) {
			expect(isZone(current), `${alias} → ${current}`).toBe(true);
			expect(ZONE_ALIASES.has(current), `${current} is itself an alias`).toBe(false);
			expect(canonicalZone(canonicalZone(alias))).toBe(current);
		}
	});

	it("computes the same slots for an alias and its current name", () => {
		for (const [alias, current] of ZONE_ALIASES) {
			if (!isZone(alias)) continue;
			const input = { dates: ["2026-03-29", "2026-10-25"], window: { start: "00:00", end: "00:00" } };
			expect(generateColumns({ ...input, zone: alias }), alias).toEqual(generateColumns({ ...input, zone: current }));
		}
	});
});
