import postgres from "postgres";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { MIGRATION_ID, MIGRATION_SQL } from "./schema-sql.ts";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type Sql = postgres.Sql;

export function connectDb(databaseUrl: string): Sql {
	return postgres(databaseUrl, { max: 1, ssl: "require" });
}

export async function migrate(sql: Sql): Promise<void> {
	await sql.unsafe(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			id text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`);
	const applied = await sql<{ id: string }[]>`
		SELECT id FROM schema_migrations WHERE id = ${MIGRATION_ID}
	`;
	if (applied.length > 0) {
		return;
	}
	await sql.unsafe(MIGRATION_SQL);
	await sql`INSERT INTO schema_migrations (id) VALUES (${MIGRATION_ID})`;
}

export type PullBranchRow = {
	repository_id: string;
	pull_number: string;
	installation_id: string;
	neon_project_id: string;
	neon_branch_id: string;
	neon_branch_name: string;
	parent_pull_number: string | null;
	origin_comment_id: string | null;
	closed_at: Date | null;
};

export async function listPullBranches(
	sql: Sql,
	repositoryId: string,
): Promise<PullBranchRow[]> {
	return sql<PullBranchRow[]>`
		SELECT
			repository_id,
			pull_number,
			installation_id,
			neon_project_id,
			neon_branch_id,
			neon_branch_name,
			parent_pull_number,
			origin_comment_id,
			closed_at
		FROM pull_branches
		WHERE repository_id = ${repositoryId}
	`;
}

export async function upsertInstallation(input: {
	sql: Sql;
	installationId: string;
	namespaceId?: string;
}): Promise<void> {
	await input.sql`
		INSERT INTO installations (installation_id, namespace_id)
		VALUES (${input.installationId}, ${input.namespaceId ?? null})
		ON CONFLICT (installation_id) DO UPDATE
		SET namespace_id = COALESCE(EXCLUDED.namespace_id, installations.namespace_id),
			revoked_at = NULL
	`;
}

export async function storeRefreshToken(input: {
	sql: Sql;
	installationId: string;
	refreshToken: string;
	appSecret: string;
}): Promise<void> {
	const ciphertext = encryptSecret(input.refreshToken, input.appSecret);
	await input.sql`
		UPDATE installations
		SET refresh_token_ciphertext = ${ciphertext}, revoked_at = NULL
		WHERE installation_id = ${input.installationId}
	`;
}

export async function readRefreshToken(input: {
	sql: Sql;
	installationId: string;
	appSecret: string;
}): Promise<string | null> {
	const rows = await input.sql<{ refresh_token_ciphertext: string | null }[]>`
		SELECT refresh_token_ciphertext
		FROM installations
		WHERE installation_id = ${input.installationId}
			AND revoked_at IS NULL
	`;
	const row = rows[0];
	if (row === undefined || row.refresh_token_ciphertext === null) {
		return null;
	}
	return decryptSecret(row.refresh_token_ciphertext, input.appSecret);
}

export async function revokeInstallation(input: {
	sql: Sql;
	installationId: string;
}): Promise<string | null> {
	const rows = await input.sql<{ refresh_token_ciphertext: string | null }[]>`
		UPDATE installations
		SET revoked_at = now()
		WHERE installation_id = ${input.installationId}
		RETURNING refresh_token_ciphertext
	`;
	return rows[0]?.refresh_token_ciphertext ?? null;
}

export async function upsertBinding(input: {
	sql: Sql;
	installationId: string;
	repositoryId: string;
	ownerSlug: string;
	repoName: string;
	neonProjectId: string;
}): Promise<void> {
	await input.sql`
		INSERT INTO repository_bindings (
			installation_id,
			repository_id,
			owner_slug,
			repo_name,
			neon_project_id
		)
		VALUES (
			${input.installationId},
			${input.repositoryId},
			${input.ownerSlug},
			${input.repoName},
			${input.neonProjectId}
		)
		ON CONFLICT (installation_id, repository_id) DO UPDATE
		SET owner_slug = EXCLUDED.owner_slug,
			repo_name = EXCLUDED.repo_name,
			neon_project_id = EXCLUDED.neon_project_id
	`;
}

export async function upsertPullBranch(input: {
	sql: Sql;
	repositoryId: string;
	pullNumber: string;
	installationId: string;
	neonProjectId: string;
	neonBranchId: string;
	neonBranchName: string;
	parentPullNumber: string | null;
}): Promise<void> {
	await input.sql`
		INSERT INTO pull_branches (
			repository_id,
			pull_number,
			installation_id,
			neon_project_id,
			neon_branch_id,
			neon_branch_name,
			parent_pull_number,
			closed_at
		)
		VALUES (
			${input.repositoryId},
			${input.pullNumber},
			${input.installationId},
			${input.neonProjectId},
			${input.neonBranchId},
			${input.neonBranchName},
			${input.parentPullNumber},
			NULL
		)
		ON CONFLICT (repository_id, pull_number) DO UPDATE
		SET
			installation_id = EXCLUDED.installation_id,
			neon_project_id = EXCLUDED.neon_project_id,
			neon_branch_id = EXCLUDED.neon_branch_id,
			neon_branch_name = EXCLUDED.neon_branch_name,
			parent_pull_number = EXCLUDED.parent_pull_number,
			closed_at = NULL
	`;
}

export async function setPullCommentId(input: {
	sql: Sql;
	repositoryId: string;
	pullNumber: string;
	commentId: string;
}): Promise<void> {
	await input.sql`
		UPDATE pull_branches
		SET origin_comment_id = ${input.commentId}
		WHERE repository_id = ${input.repositoryId}
			AND pull_number = ${input.pullNumber}
	`;
}

export async function markPullClosed(input: {
	sql: Sql;
	repositoryId: string;
	pullNumber: string;
}): Promise<void> {
	await input.sql`
		UPDATE pull_branches
		SET closed_at = now()
		WHERE repository_id = ${input.repositoryId}
			AND pull_number = ${input.pullNumber}
	`;
}

export async function deletePullBranchRow(input: {
	sql: Sql;
	repositoryId: string;
	pullNumber: string;
}): Promise<void> {
	await input.sql`
		DELETE FROM pull_branches
		WHERE repository_id = ${input.repositoryId}
			AND pull_number = ${input.pullNumber}
	`;
}

export async function insertOauthState(input: {
	sql: Sql;
	state: string;
	codeVerifier: string;
	installationId?: string;
}): Promise<void> {
	await input.sql`
		INSERT INTO oauth_states (state, code_verifier, installation_id)
		VALUES (
			${input.state},
			${input.codeVerifier},
			${input.installationId ?? null}
		)
	`;
}

export async function consumeOauthState(input: {
	sql: Sql;
	state: string;
}): Promise<{ codeVerifier: string; installationId: string | null }> {
	const rows = await input.sql<
		{
			code_verifier: string;
			installation_id: string | null;
			created_at: Date;
			used_at: Date | null;
		}[]
	>`
		SELECT code_verifier, installation_id, created_at, used_at
		FROM oauth_states
		WHERE state = ${input.state}
	`;
	const row = rows[0];
	if (row === undefined) {
		throw new Error("oauth state is unknown");
	}
	if (row.used_at !== null) {
		throw new Error("oauth state was already used");
	}
	if (Date.now() - row.created_at.getTime() > OAUTH_STATE_TTL_MS) {
		throw new Error("oauth state expired");
	}
	const updated = await input.sql`
		UPDATE oauth_states
		SET used_at = now()
		WHERE state = ${input.state} AND used_at IS NULL
	`;
	if (updated.count !== 1) {
		throw new Error("oauth state was already used");
	}
	return {
		codeVerifier: row.code_verifier,
		installationId: row.installation_id,
	};
}

export async function claimWebhookDelivery(input: {
	sql: Sql;
	webhookId: string;
	eventType: string;
}): Promise<"claimed" | "duplicate"> {
	const rows = await input.sql`
		INSERT INTO webhook_deliveries (webhook_id, event_type)
		VALUES (${input.webhookId}, ${input.eventType})
		ON CONFLICT (webhook_id) DO NOTHING
		RETURNING webhook_id
	`;
	return rows.length === 0 ? "duplicate" : "claimed";
}

export async function markWebhookProcessed(
	sql: Sql,
	webhookId: string,
): Promise<void> {
	await sql`
		UPDATE webhook_deliveries
		SET processed_at = now()
		WHERE webhook_id = ${webhookId}
	`;
}

export async function releaseWebhookClaim(
	sql: Sql,
	webhookId: string,
): Promise<void> {
	await sql`
		DELETE FROM webhook_deliveries
		WHERE webhook_id = ${webhookId} AND processed_at IS NULL
	`;
}

export async function webhookProcessed(
	sql: Sql,
	webhookId: string,
): Promise<boolean> {
	const rows = await sql<{ processed_at: Date | null }[]>`
		SELECT processed_at
		FROM webhook_deliveries
		WHERE webhook_id = ${webhookId}
	`;
	const row = rows[0];
	if (row === undefined) {
		return false;
	}
	return row.processed_at !== null;
}

export async function listPullsForInstall(
	sql: Sql,
	installationId: string,
): Promise<PullBranchRow[]> {
	return sql<PullBranchRow[]>`
		SELECT
			repository_id,
			pull_number,
			installation_id,
			neon_project_id,
			neon_branch_id,
			neon_branch_name,
			parent_pull_number,
			origin_comment_id,
			closed_at
		FROM pull_branches
		WHERE installation_id = ${installationId}
	`;
}

export async function deletePullsForInstall(
	sql: Sql,
	installationId: string,
): Promise<void> {
	await sql`
		DELETE FROM pull_branches
		WHERE installation_id = ${installationId}
	`;
}
