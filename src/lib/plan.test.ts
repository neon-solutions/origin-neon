import { describe, expect, it } from "vitest";
import {
	closedAncestorsToDelete,
	planClose,
	planEnsure,
	planRetarget,
	type StoredPull,
} from "./plan.ts";

const repo = "repo_01abcdefgh";

function stored(
	partial: Partial<StoredPull> & { pullNumber: string },
): StoredPull {
	return {
		neonBranchId: `br-${partial.pullNumber}`,
		neonBranchName: `origin-abcdefgh-pr-${partial.pullNumber}`,
		parentPullNumber: null,
		closedAt: null,
		...partial,
	};
}

describe("planEnsure", () => {
	it("rejects a repository that is not allowlisted", () => {
		const plan = planEnsure({
			repositoryId: repo,
			pullNumber: "1",
			baseRef: "main",
			allowlisted: false,
			openPulls: [],
			stored: [],
		});
		expect(plan.kind).toBe("action_required");
	});

	it("reuses an open stored branch", () => {
		const plan = planEnsure({
			repositoryId: repo,
			pullNumber: "1",
			baseRef: "main",
			allowlisted: true,
			openPulls: [{ number: "1", headRef: "feat" }],
			stored: [stored({ pullNumber: "1" })],
		});
		expect(plan).toEqual({
			kind: "reuse",
			branchName: "origin-abcdefgh-pr-1",
			neonBranchId: "br-1",
		});
	});

	it("creates off default when the base is not another open pull", () => {
		const plan = planEnsure({
			repositoryId: repo,
			pullNumber: "1",
			baseRef: "main",
			allowlisted: true,
			openPulls: [{ number: "1", headRef: "feat" }],
			stored: [],
		});
		expect(plan).toEqual({
			kind: "create",
			branchName: "origin-abcdefgh-pr-1",
			parentPullNumber: null,
		});
	});

	it("stacks when the parent pull already has a Neon branch", () => {
		const plan = planEnsure({
			repositoryId: repo,
			pullNumber: "2",
			baseRef: "feat-a",
			allowlisted: true,
			openPulls: [
				{ number: "1", headRef: "feat-a" },
				{ number: "2", headRef: "feat-b" },
			],
			stored: [stored({ pullNumber: "1" })],
		});
		expect(plan).toEqual({
			kind: "create",
			branchName: "origin-abcdefgh-pr-2",
			parentPullNumber: "1",
		});
	});

	it("fails loud when the stacked parent has no Neon branch", () => {
		const plan = planEnsure({
			repositoryId: repo,
			pullNumber: "2",
			baseRef: "feat-a",
			allowlisted: true,
			openPulls: [
				{ number: "1", headRef: "feat-a" },
				{ number: "2", headRef: "feat-b" },
			],
			stored: [],
		});
		expect(plan.kind).toBe("action_required");
	});
});

describe("planRetarget", () => {
	it("is ok when the resolved parent is unchanged", () => {
		const plan = planRetarget({
			pullNumber: "2",
			baseRef: "feat-a",
			openPulls: [
				{ number: "1", headRef: "feat-a" },
				{ number: "2", headRef: "feat-b" },
			],
			stored: [
				stored({ pullNumber: "1" }),
				stored({ pullNumber: "2", parentPullNumber: "1" }),
			],
		});
		expect(plan).toEqual({ kind: "retarget_ok" });
	});

	it("fails loud when the base moves to a different parent", () => {
		const plan = planRetarget({
			pullNumber: "2",
			baseRef: "main",
			openPulls: [
				{ number: "1", headRef: "feat-a" },
				{ number: "2", headRef: "feat-b" },
			],
			stored: [
				stored({ pullNumber: "1" }),
				stored({ pullNumber: "2", parentPullNumber: "1" }),
			],
		});
		expect(plan.kind).toBe("action_required");
	});
});

describe("planClose", () => {
	it("keeps a closed ancestor while an open child exists", () => {
		const plan = planClose({
			pullNumber: "1",
			stored: [
				stored({ pullNumber: "1" }),
				stored({ pullNumber: "2", parentPullNumber: "1" }),
			],
		});
		expect(plan.kind).toBe("close_keep");
	});

	it("deletes a leaf", () => {
		const plan = planClose({
			pullNumber: "2",
			stored: [
				stored({ pullNumber: "1" }),
				stored({ pullNumber: "2", parentPullNumber: "1" }),
			],
		});
		expect(plan).toEqual({ kind: "close_delete", neonBranchId: "br-2" });
	});
});

describe("closedAncestorsToDelete", () => {
	it("deletes a closed parent after the last child is gone", () => {
		const ids = closedAncestorsToDelete({
			startPullNumber: "2",
			stored: [
				stored({
					pullNumber: "1",
					closedAt: "2026-08-17T00:00:00Z",
				}),
				stored({
					pullNumber: "2",
					parentPullNumber: "1",
					closedAt: "2026-08-17T00:01:00Z",
				}),
			],
		});
		expect(ids).toEqual(["br-1"]);
	});

	it("stops at an open ancestor", () => {
		const ids = closedAncestorsToDelete({
			startPullNumber: "2",
			stored: [
				stored({ pullNumber: "1" }),
				stored({
					pullNumber: "2",
					parentPullNumber: "1",
					closedAt: "2026-08-17T00:01:00Z",
				}),
			],
		});
		expect(ids).toEqual([]);
	});
});
