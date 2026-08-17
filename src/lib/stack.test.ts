import { describe, expect, it } from "vitest";
import { resolveStackParent } from "./stack.ts";

describe("resolveStackParent", () => {
	it("returns none when no open pull has the base as its head", () => {
		expect(
			resolveStackParent({
				pullNumber: "2",
				baseRef: "main",
				openPulls: [
					{ number: "2", headRef: "feat-b" },
					{ number: "1", headRef: "feat-a" },
				],
			}),
		).toEqual({ kind: "none" });
	});

	it("returns the matching open pull when base equals that head", () => {
		expect(
			resolveStackParent({
				pullNumber: "2",
				baseRef: "feat-a",
				openPulls: [
					{ number: "2", headRef: "feat-b" },
					{ number: "1", headRef: "feat-a" },
				],
			}),
		).toEqual({ kind: "parent", pullNumber: "1" });
	});

	it("does not treat the current pull as its own parent", () => {
		expect(
			resolveStackParent({
				pullNumber: "1",
				baseRef: "feat-a",
				openPulls: [{ number: "1", headRef: "feat-a" }],
			}),
		).toEqual({ kind: "none" });
	});

	it("fails loud when two open pulls share the same head", () => {
		const result = resolveStackParent({
			pullNumber: "3",
			baseRef: "shared",
			openPulls: [
				{ number: "1", headRef: "shared" },
				{ number: "2", headRef: "shared" },
			],
		});
		expect(result.kind).toBe("unresolved");
	});
});
