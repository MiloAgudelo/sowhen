import { describe, expect, it } from "vitest";
import { cleanDisplayName, normaliseName } from "@/domain";

describe("normaliseName", () => {
	it("trims, collapses whitespace and lowercases", () => {
		expect(normaliseName("  Anna   K ")).toBe("anna k");
		expect(normaliseName("  Anna   K ")).toBe(normaliseName("anna k"));
		expect(normaliseName("Anna\tK\n")).toBe("anna k");
		expect(normaliseName("Anna K")).toBe("anna k"); // no-break space
	});

	it("case-folds non-ASCII letters", () => {
		expect(normaliseName("ÉMILIE")).toBe(normaliseName("émilie"));
		expect(normaliseName("ŁUKASZ")).toBe("łukasz");
		expect(normaliseName("ΣΟΦΙΑ")).toBe(normaliseName("σοφια"));
	});

	it("treats NFC and NFD forms as equal", () => {
		const nfc = "Émilie"; // É precomposed
		const nfd = "Émilie"; // E + combining acute
		expect(nfc).not.toBe(nfd);
		expect(normaliseName(nfd)).toBe(normaliseName(nfc));
		expect(normaliseName(nfd)).toBe("émilie");
	});

	it("keeps different names different", () => {
		expect(normaliseName("Anna K")).not.toBe(normaliseName("Anna M"));
		expect(normaliseName("AnnaK")).not.toBe(normaliseName("Anna K"));
	});
});

describe("cleanDisplayName", () => {
	it("trims and collapses whitespace but keeps case", () => {
		expect(cleanDisplayName("  Anna   K ")).toBe("Anna K");
		expect(cleanDisplayName("Émilie")).toBe("Émilie");
	});

	it("returns null for empty or whitespace-only names", () => {
		expect(cleanDisplayName("")).toBeNull();
		expect(cleanDisplayName("   \t\n ")).toBeNull();
	});

	it("composes to NFC", () => {
		expect(cleanDisplayName("Émilie")).toBe("Émilie");
	});

	it("truncates to 40 characters", () => {
		expect(cleanDisplayName("a".repeat(40))).toBe("a".repeat(40));
		expect(cleanDisplayName("b".repeat(45))).toBe("b".repeat(40));
	});

	it("never leaves a trailing space after truncating", () => {
		expect(cleanDisplayName(`${"a".repeat(39)} bcd`)).toBe("a".repeat(39));
	});

	it("never splits an emoji or a combining sequence", () => {
		const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
		expect(cleanDisplayName(`${"a".repeat(39)}${family}b`)).toBe(`${"a".repeat(39)}${family}`);
	});
});
