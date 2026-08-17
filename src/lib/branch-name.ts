const REPO_SUFFIX_LENGTH = 8;

export function neonBranchName(input: {
	repositoryId: string;
	pullNumber: string;
}): string {
	const suffix = input.repositoryId
		.replace(/[^a-zA-Z0-9]/g, "")
		.slice(-REPO_SUFFIX_LENGTH)
		.toLowerCase();
	if (suffix.length === 0) {
		throw new Error(
			`repository id ${input.repositoryId} has no alphanumeric characters`,
		);
	}
	if (!/^[0-9]+$/.test(input.pullNumber)) {
		throw new Error(`pull number ${input.pullNumber} is not digits`);
	}
	return `origin-${suffix}-pr-${input.pullNumber}`;
}
