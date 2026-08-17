import { neonBranchName } from "./branch-name.ts";
import { resolveStackParent, type OpenPull } from "./stack.ts";

export type StoredPull = {
	pullNumber: string;
	neonBranchId: string;
	neonBranchName: string;
	parentPullNumber: string | null;
	closedAt: string | null;
};

export type ActionRequired = { kind: "action_required"; reason: string };

export type EnsurePlan =
	| {
			kind: "create";
			branchName: string;
			parentPullNumber: string | null;
	  }
	| { kind: "reuse"; branchName: string; neonBranchId: string }
	| ActionRequired;

export type RetargetPlan = { kind: "retarget_ok" } | ActionRequired;

export type ClosePlan =
	| { kind: "close_keep"; reason: string }
	| { kind: "close_delete"; neonBranchId: string };

export function planEnsure(input: {
	repositoryId: string;
	pullNumber: string;
	baseRef: string;
	allowlisted: boolean;
	openPulls: OpenPull[];
	stored: StoredPull[];
}): EnsurePlan {
	if (!input.allowlisted) {
		return {
			kind: "action_required",
			reason: `repository ${input.repositoryId} is not in ORIGIN_REPO_ALLOWLIST`,
		};
	}

	const existing = input.stored.find(
		(row) => row.pullNumber === input.pullNumber,
	);
	if (existing && existing.closedAt === null) {
		return {
			kind: "reuse",
			branchName: existing.neonBranchName,
			neonBranchId: existing.neonBranchId,
		};
	}

	const stack = resolveStackParent({
		pullNumber: input.pullNumber,
		baseRef: input.baseRef,
		openPulls: input.openPulls,
	});
	if (stack.kind === "unresolved") {
		return { kind: "action_required", reason: stack.reason };
	}

	if (stack.kind === "parent") {
		const parent = input.stored.find(
			(row) => row.pullNumber === stack.pullNumber && row.closedAt === null,
		);
		if (parent === undefined) {
			return {
				kind: "action_required",
				reason: `stacked on pull ${stack.pullNumber}, which has no open Neon branch`,
			};
		}
		return {
			kind: "create",
			branchName: neonBranchName({
				repositoryId: input.repositoryId,
				pullNumber: input.pullNumber,
			}),
			parentPullNumber: stack.pullNumber,
		};
	}

	return {
		kind: "create",
		branchName: neonBranchName({
			repositoryId: input.repositoryId,
			pullNumber: input.pullNumber,
		}),
		parentPullNumber: null,
	};
}

export function planRetarget(input: {
	pullNumber: string;
	baseRef: string;
	openPulls: OpenPull[];
	stored: StoredPull[];
}): RetargetPlan {
	const existing = input.stored.find(
		(row) => row.pullNumber === input.pullNumber && row.closedAt === null,
	);
	if (existing === undefined) {
		return {
			kind: "action_required",
			reason: `pull ${input.pullNumber} has no open Neon branch to retarget`,
		};
	}

	const stack = resolveStackParent({
		pullNumber: input.pullNumber,
		baseRef: input.baseRef,
		openPulls: input.openPulls,
	});
	if (stack.kind === "unresolved") {
		return { kind: "action_required", reason: stack.reason };
	}

	const nextParent = stack.kind === "parent" ? stack.pullNumber : null;
	if (nextParent !== existing.parentPullNumber) {
		return {
			kind: "action_required",
			reason: `base moved; stored parent is ${existing.parentPullNumber ?? "default"}, resolved parent is ${nextParent ?? "default"}`,
		};
	}
	return { kind: "retarget_ok" };
}

export function planClose(input: {
	pullNumber: string;
	stored: StoredPull[];
}): ClosePlan {
	const existing = input.stored.find(
		(row) => row.pullNumber === input.pullNumber,
	);
	if (existing === undefined) {
		return {
			kind: "close_keep",
			reason: `pull ${input.pullNumber} has no Neon branch`,
		};
	}

	const openChildren = input.stored.filter(
		(row) =>
			row.parentPullNumber === input.pullNumber &&
			row.closedAt === null &&
			row.pullNumber !== input.pullNumber,
	);
	if (openChildren.length > 0) {
		const numbers = openChildren.map((row) => row.pullNumber).join(", ");
		return {
			kind: "close_keep",
			reason: `open child pulls still exist: ${numbers}`,
		};
	}
	return { kind: "close_delete", neonBranchId: existing.neonBranchId };
}

export function closedAncestorsToDelete(input: {
	startPullNumber: string;
	stored: StoredPull[];
}): string[] {
	const byNumber = new Map(input.stored.map((row) => [row.pullNumber, row]));
	const deleted: string[] = [];
	let current = byNumber.get(input.startPullNumber);
	while (current?.parentPullNumber) {
		const parent = byNumber.get(current.parentPullNumber);
		if (parent === undefined || parent.closedAt === null) {
			break;
		}
		const openChildren = input.stored.filter(
			(row) =>
				row.parentPullNumber === parent.pullNumber &&
				row.closedAt === null &&
				!deleted.includes(row.neonBranchId),
		);
		if (openChildren.length > 0) {
			break;
		}
		deleted.push(parent.neonBranchId);
		current = parent;
	}
	return deleted;
}
