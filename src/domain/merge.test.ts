import { describe, expect, it } from "vitest";
import { mergeResponses } from "@/domain";
import { response } from "./test-helpers";

describe("mergeResponses", () => {
	const server = [response("Ana", [1]), response("Ben", [2]), response("Chen", [3])];

	it("returns the server list when not editing", () => {
		expect(mergeResponses(server, null, null)).toEqual(server);
		expect(mergeResponses(server, null, response("Ben", [99]))).toEqual(server);
	});

	it("returns the server list when there is no draft", () => {
		expect(mergeResponses(server, "ben", null)).toEqual(server);
	});

	it("keeps the own draft in place of the server's copy", () => {
		const draft = response("Ben", [2, 4, 6]);
		expect(mergeResponses(server, "ben", draft)).toEqual([server[0], draft, server[2]]);
	});

	it("own draft survives a poll while others are replaced", () => {
		const draft = response("Ben", [10, 11]);
		const polled = [response("Ana", [1, 5]), response("Ben", [2]), response("Chen", [3, 7]), response("Dana", [8])];
		const merged = mergeResponses(polled, "ben", draft);
		expect(merged.find((r) => r.nameKey === "ben")).toBe(draft);
		expect(merged.find((r) => r.nameKey === "ana")!.available).toEqual([1, 5]);
		expect(merged.find((r) => r.nameKey === "chen")!.available).toEqual([3, 7]);
		expect(merged.map((r) => r.nameKey)).toEqual(["ana", "ben", "chen", "dana"]);
	});

	it("responses deleted on the server disappear", () => {
		const draft = response("Ben", [10]);
		const polled = [response("Ben", [2])];
		expect(mergeResponses(polled, "ben", draft)).toEqual([draft]);
	});

	it("appends the draft when the server has no response for it yet", () => {
		const draft = response("Dana", [9]);
		expect(mergeResponses(server, "dana", draft)).toEqual([...server, draft]);
		expect(mergeResponses([], "dana", draft)).toEqual([draft]);
	});

	it("does not mutate the server list", () => {
		const copy = server.slice();
		mergeResponses(server, "ben", response("Ben", [42]));
		expect(server).toEqual(copy);
	});
});
