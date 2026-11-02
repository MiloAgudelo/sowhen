import { describe, expect, it } from "vitest";
import { allZones, zoneCountry, zoneCountryName } from "@/lib/zones";

describe("zoneCountry", () => {
	it("maps zones to their country", () => {
		expect(zoneCountry("Europe/Warsaw")).toBe("pl");
		expect(zoneCountry("America/Bogota")).toBe("co");
		expect(zoneCountry("Europe/Kyiv")).toBe("ua");
	});
	it("canonicalises old names first", () => {
		expect(zoneCountry("Asia/Calcutta")).toBe("in");
		expect(zoneCountry("Europe/Kiev")).toBe("ua");
	});
	it("has no country for UTC", () => {
		expect(zoneCountry("UTC")).toBeUndefined();
	});
	it("names the country for search", () => {
		expect(zoneCountryName("America/Bogota")).toBe("Colombia");
	});
	it("covers every geographic zone the runtime lists", () => {
		const missing = allZones().filter((z) => z.includes("/") && !z.startsWith("Etc/") && !zoneCountry(z));
		expect(missing).toEqual([]);
	});
});
