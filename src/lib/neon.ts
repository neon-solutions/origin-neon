import { createNeonClient } from "@neon/sdk";

export function neonClient(apiKey: string) {
	return createNeonClient({ apiKey, throwOnError: true });
}

export async function createPreviewBranch(input: {
	apiKey: string;
	projectId: string;
	name: string;
	parentId?: string;
}): Promise<{ branchId: string; branchName: string }> {
	const neon = neonClient(input.apiKey);
	const created = await neon.branches.createWithCompute(input.projectId, {
		name: input.name,
		...(input.parentId === undefined ? {} : { parentId: input.parentId }),
	});
	return {
		branchId: created.branch.id,
		branchName: created.branch.name,
	};
}

export async function deletePreviewBranch(input: {
	apiKey: string;
	projectId: string;
	branchId: string;
}): Promise<void> {
	const neon = neonClient(input.apiKey);
	await neon.branches.delete(input.projectId, input.branchId);
}
