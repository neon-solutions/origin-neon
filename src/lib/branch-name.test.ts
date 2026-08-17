import { describe, expect, it } from "vitest";
import { neonBranchName } from "./branch-name.ts";

describe("neonBranchName", () => {
	it("uses the last 8 alphanumeric characters of the repository id", () => {
		expect(
			neonBranchName({
				repositoryId: "repo_01ABCDEFGH",
				pullNumber: "12",
			}),
		).toBe("origin-abcdefgh-pr-12");
	});

	it("does not put the head ref in the name", () => {
		const name = neonBranchName({
			repositoryId: "repo_01zzzzzzzz",
			pullNumber: "3",
		});
		expect(name).toBe("origin-zzzzzzzz-pr-3");
		expect(name.includes("feat")).toBe(false);
	});

	it("rejects a repository id with no alphanumeric characters", () => {
		expect(() =>
			neonBranchName({ repositoryId: "___", pullNumber: "1" }),
		).toThrow(/no alphanumeric/);
	});

	it("rejects a non-digit pull number", () => {
		expect(() =>
			neonBranchName({ repositoryId: "repo_01abcd", pullNumber: "1a" }),
		).toThrow(/not digits/);
	});
});
