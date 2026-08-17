import { createNeonClient } from "@neon/sdk";
import { afterAll, describe, expect, it } from "vitest";
import { neonBranchName } from "../../src/lib/branch-name.ts";

const live = process.env.ORIGIN_NEON_LIVE === "1";
const apiKey = process.env.NEON_API_KEY;
const orgId = process.env.NEON_ORG_ID;

describe.skipIf(!live || apiKey === undefined || orgId === undefined)(
	"live Neon preview branches",
	() => {
		if (apiKey === undefined || orgId === undefined) {
			throw new Error(
				"ORIGIN_NEON_LIVE=1 requires NEON_API_KEY and NEON_ORG_ID",
			);
		}

		const neon = createNeonClient({ apiKey, throwOnError: true, orgId });
		let projectId: string | undefined;
		const createdBranchIds: string[] = [];

		afterAll(async () => {
			if (projectId === undefined) {
				return;
			}
			for (const branchId of [...createdBranchIds].reverse()) {
				try {
					await neon.branches.delete(projectId, branchId);
				} catch {
					// Project delete below removes anything left.
				}
			}
			await neon.projects.delete(projectId);
		});

		it("creates stacked branches without a TTL and deletes leaf-first", async () => {
			const created = await neon.projects.createAndConnect({
				name: `smoke-origin-neon-${crypto.randomUUID().slice(0, 8)}`,
				region_id: "aws-us-east-2",
			});
			projectId = created.project.id;

			const parentName = neonBranchName({
				repositoryId: "repo_01livee2e",
				pullNumber: "1",
			});
			const childName = neonBranchName({
				repositoryId: "repo_01livee2e",
				pullNumber: "2",
			});

			const parent = await neon.branches.createWithCompute(projectId, {
				name: parentName,
			});
			createdBranchIds.push(parent.branch.id);
			expect(parent.branch.name).toBe(parentName);
			expect(parent.branch.expires_at).toBeFalsy();
			expect(parent.connectionString.startsWith("postgres")).toBe(true);

			const child = await neon.branches.createWithCompute(projectId, {
				name: childName,
				parentId: parent.branch.id,
			});
			createdBranchIds.push(child.branch.id);
			expect(child.branch.parent_id).toBe(parent.branch.id);
			expect(child.branch.expires_at).toBeFalsy();

			await neon.branches.delete(projectId, child.branch.id);
			createdBranchIds.pop();
			await neon.branches.delete(projectId, parent.branch.id);
			createdBranchIds.pop();
		});
	},
);
