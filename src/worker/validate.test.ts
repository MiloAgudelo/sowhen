import { describe, expect, it, vi } from "vitest";

// cleanDisplayName comes from @/domain (agent A); a minimal stand-in keeps these tests independent.
vi.mock("@/domain", () => ({
	cleanDisplayName: (s: string) => {
		const t = s.trim().replace(/\s+/g, " ").slice(0, 40);
		return t ? t : null;
	},
}));

import { constantTimeEqual, generateSecret, sha256Hex, verifySecret } from "./auth";
import { HttpError } from "./http";
import {
	checkSlotsBelong,
	isIsoDate,
	isValidZone,
	parseCreateInput,
	parseDates,
	parseDuration,
	parsePatchInput,
	parsePutResponseInput,
	parseTitle,
	parseWindow,
} from "./validate";

const rejects = (fn: () => unknown) => {
	try {
		fn();
	} catch (err) {
		expect(err).toBeInstanceOf(HttpError);
		expect((err as HttpError).code).toBe("bad_request");
		return;
	}
	throw new Error("expected a bad_request");
};

describe("dates", () => {
	it("accepts real calendar dates only", () => {
		expect(isIsoDate("2027-03-10")).toBe(true);
		expect(isIsoDate("2028-02-29")).toBe(true);
		expect(isIsoDate("2027-02-29")).toBe(false);
		expect(isIsoDate("2027-13-01")).toBe(false);
		expect(isIsoDate("2027-3-1")).toBe(false);
		expect(isIsoDate("1999-12-31")).toBe(false);
		expect(isIsoDate(20270310)).toBe(false);
	});

	it("sorts and de-duplicates, 1–31 dates", () => {
		expect(parseDates(["2027-03-12", "2027-03-10", "2027-03-12"])).toEqual(["2027-03-10", "2027-03-12"]);
		rejects(() => parseDates([]));
		rejects(() => parseDates("2027-03-10"));
		rejects(() => parseDates(["2027-03-10", "nope"]));
		const many = Array.from({ length: 32 }, (_, i) => `2027-01-${String((i % 28) + 1).padStart(2, "0")}`);
		rejects(() => parseDates(many));
	});
});

describe("window, duration, title, zone", () => {
	it("window times sit on 30-minute boundaries", () => {
		expect(parseWindow({ start: "09:00", end: "17:30" })).toEqual({ start: "09:00", end: "17:30" });
		expect(parseWindow({ start: "20:00", end: "02:00" })).toEqual({ start: "20:00", end: "02:00" });
		expect(parseWindow({ start: "00:00", end: "00:00" })).toEqual({ start: "00:00", end: "00:00" });
		rejects(() => parseWindow({ start: "09:15", end: "17:00" }));
		rejects(() => parseWindow({ start: "24:00", end: "17:00" }));
		rejects(() => parseWindow({ start: "9:00", end: "17:00" }));
		rejects(() => parseWindow(null));
	});

	it("duration must be one of MEETING_DURATIONS", () => {
		expect(parseDuration(90)).toBe(90);
		rejects(() => parseDuration(45));
		rejects(() => parseDuration("60"));
	});

	it("title is trimmed, collapsed and capped", () => {
		expect(parseTitle("  Comms   weekly ")).toBe("Comms weekly");
		rejects(() => parseTitle("   "));
		rejects(() => parseTitle("x".repeat(101)));
		rejects(() => parseTitle(undefined));
	});

	it("zone must be a real IANA zone", () => {
		expect(isValidZone("Europe/Warsaw")).toBe(true);
		expect(isValidZone("Asia/Kathmandu")).toBe(true);
		expect(isValidZone("UTC")).toBe(true);
		expect(isValidZone("Mars/Olympus")).toBe(false);
		expect(isValidZone("+05:00")).toBe(false);
		expect(isValidZone("")).toBe(false);
		expect(isValidZone(42)).toBe(false);
	});
});

describe("request bodies", () => {
	const create = {
		slug: "comms-weekly",
		title: "Comms weekly",
		creatorZone: "Europe/Warsaw",
		dates: ["2027-03-10"],
		window: { start: "09:00", end: "17:00" },
		durationMinutes: 60,
	};

	it("create: defaults duration to 60 and requires a slug", () => {
		const { durationMinutes: _d, ...noDuration } = create;
		expect(parseCreateInput(noDuration).durationMinutes).toBe(60);
		rejects(() => parseCreateInput({ ...create, slug: 5 }));
		rejects(() => parseCreateInput({ ...create, creatorZone: "Nowhere/Land" }));
	});

	it("patch: at least one field", () => {
		expect(parsePatchInput({ title: "New" })).toEqual({ title: "New" });
		rejects(() => parsePatchInput({}));
		rejects(() => parsePatchInput({ durationMinutes: 10 }));
	});

	it("put response: cleans the name, sorts and de-duplicates slots", () => {
		expect(parsePutResponseInput({ name: "  Anna  K ", available: [60, 30, 30], ifNeeded: [] })).toEqual({
			name: "Anna K",
			available: [30, 60],
			ifNeeded: [],
		});
		rejects(() => parsePutResponseInput({ name: "   ", available: [] }));
		rejects(() => parsePutResponseInput({ name: "A", available: [1.5] }));
		rejects(() => parsePutResponseInput({ name: "A", available: "1" }));
		rejects(() => parsePutResponseInput({ name: "A".repeat(201) }));
	});

	it("slots must belong to the event and not overlap", () => {
		const columns = [{ date: "2027-03-10", slots: [0, 30, 60] }];
		expect(() => checkSlotsBelong({ available: [0], ifNeeded: [30] }, columns)).not.toThrow();
		rejects(() => checkSlotsBelong({ available: [90], ifNeeded: [] }, columns));
		rejects(() => checkSlotsBelong({ available: [0, 30], ifNeeded: [30] }, columns));
	});
});

describe("admin secret", () => {
	it("is 32 random bytes in base64url", () => {
		const a = generateSecret();
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(generateSecret()).not.toBe(a);
	});

	it("verifies by hash", async () => {
		const secret = generateSecret();
		const hash = await sha256Hex(secret);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(await verifySecret(secret, hash)).toBe(true);
		expect(await verifySecret(`${secret}x`, hash)).toBe(false);
		expect(await verifySecret(null, hash)).toBe(false);
		expect(await verifySecret("", hash)).toBe(false);
	});

	it("constant-time compare handles unequal lengths", () => {
		expect(constantTimeEqual("abc", "abc")).toBe(true);
		expect(constantTimeEqual("abc", "abd")).toBe(false);
		expect(constantTimeEqual("abc", "ab")).toBe(false);
	});
});
