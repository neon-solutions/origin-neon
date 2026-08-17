export type OpenPull = {
	number: string;
	headRef: string;
};

export type StackParent =
	| { kind: "none" }
	| { kind: "parent"; pullNumber: string }
	| { kind: "unresolved"; reason: string };

export function resolveStackParent(input: {
	pullNumber: string;
	baseRef: string;
	openPulls: OpenPull[];
}): StackParent {
	const matches = input.openPulls.filter(
		(pull) =>
			pull.number !== input.pullNumber && pull.headRef === input.baseRef,
	);
	if (matches.length === 0) {
		return { kind: "none" };
	}
	if (matches.length > 1) {
		const numbers = matches.map((pull) => pull.number).join(", ");
		return {
			kind: "unresolved",
			reason: `base ref ${input.baseRef} matches multiple open pull heads: ${numbers}`,
		};
	}
	const parent = matches[0];
	if (parent === undefined) {
		return { kind: "none" };
	}
	return { kind: "parent", pullNumber: parent.number };
}
