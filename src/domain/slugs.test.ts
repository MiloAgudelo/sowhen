import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugify, validateSlug } from "@/domain";

describe("validateSlug", () => {
	it("accepts lowercase letters, digits and single hyphens", () => {
		for (const s of ["comms-weekly", "abc", "a1b", "2027-jamboree", "comms-weekly-2", "a".repeat(48)]) {
			expect([s, validateSlug(s)]).toEqual([s, { ok: true }]);
		}
	});

	it("rejects bad formats", () => {
		for (const s of [
			"", "ab", "a".repeat(49), "Comms", "comms weekly", "comms_weekly", "comms--weekly",
			"-comms", "comms-", "reunión", "comms.weekly", "comms/weekly",
		]) {
			expect([s, validateSlug(s)]).toEqual([s, { ok: false, reason: "format" }]);
		}
	});

	it("rejects reserved slugs", () => {
		for (const s of ["api", "new", "admin", "assets", "static", "privacy", "about", "help", "terms", "health"]) {
			expect([s, validateSlug(s)]).toEqual([s, { ok: false, reason: "reserved" }]);
		}
	});

	it("never accepts any reserved entry", () => {
		for (const s of RESERVED_SLUGS) expect(validateSlug(s).ok).toBe(false);
	});

	it("allows slugs that merely contain a reserved word", () => {
		expect(validateSlug("api-team")).toEqual({ ok: true });
		expect(validateSlug("news")).toEqual({ ok: true });
	});
});

describe("slugify", () => {
	it.each([
		["Comms weekly sync!", "comms-weekly-sync"],
		["Reunión semanal", "reunion-semanal"],
		["Spotkanie łączności", "spotkanie-lacznosci"],
		["ŁÓDŹ Żółć", "lodz-zolc"],
		["Straße", "strasse"],
		["Ærø Øst", "aero-ost"],
		["Café crème", "cafe-creme"],
		["  --Hello__World--  ", "hello-world"],
		["WSJ 2027: Comms & Media", "wsj-2027-comms-media"],
		["日本語", ""],
	])("%s → %s", (title, slug) => {
		expect(slugify(title)).toBe(slug);
	});

	it("produces valid slugs for ordinary titles", () => {
		for (const t of ["Comms weekly sync!", "Reunión semanal", "Spotkanie łączności"]) {
			expect(validateSlug(slugify(t))).toEqual({ ok: true });
		}
	});

	it("caps the length at 48 without a trailing hyphen", () => {
		const s = slugify(`${"a".repeat(47)} bcd`);
		expect(s).toBe("a".repeat(47));
		const long = slugify("The quarterly communications planning meeting for the jamboree team");
		expect(long.length).toBeLessThanOrEqual(48);
		expect(validateSlug(long)).toEqual({ ok: true });
	});

	it("leaves reserved results to validateSlug", () => {
		expect(slugify("Admin")).toBe("admin");
		expect(validateSlug(slugify("Admin"))).toEqual({ ok: false, reason: "reserved" });
	});
});
