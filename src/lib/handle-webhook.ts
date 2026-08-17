import type { Config } from "./config.ts";
import { repoAllowed } from "./config.ts";
import { neonApiKeyForInstall, neonProjectId } from "./credentials.ts";
import {
	claimWebhookDelivery,
	deletePullsForInstall,
	listPullBranches,
	listPullsForInstall,
	markPullClosed,
	markWebhookProcessed,
	releaseWebhookClaim,
	revokeInstallation,
	upsertBinding,
	upsertInstallation,
	upsertPullBranch,
	setPullCommentId,
	webhookProcessed,
	type PullBranchRow,
	type Sql,
} from "./db.ts";
import { decryptSecret } from "./crypto.ts";
import { createPreviewBranch, deletePreviewBranch } from "./neon.ts";
import { revokeOauthRefreshToken } from "./oauth.ts";
import {
	branchCommentBody,
	listOpenPulls,
	mintInstallationToken,
	upsertCheck,
	upsertPrComment,
	type RepoRef,
} from "./origin.ts";
import {
	closedAncestorsToDelete,
	planClose,
	planEnsure,
	planRetarget,
	type StoredPull,
} from "./plan.ts";
import {
	CLOSE_EVENTS,
	ENSURE_EVENTS,
	INSTALL_EVENT,
	RETARGET_EVENT,
	UNINSTALL_EVENT,
	parseDelivery,
	parsePullEvent,
} from "./payload.ts";
import {
	fetchOriginJwks,
	readWebhookHeaders,
	verifyWebhookSignature,
} from "./webhook.ts";

function toStored(rows: PullBranchRow[]): StoredPull[] {
	return rows.map((row) => ({
		pullNumber: row.pull_number,
		neonBranchId: row.neon_branch_id,
		neonBranchName: row.neon_branch_name,
		parentPullNumber: row.parent_pull_number,
		closedAt: row.closed_at === null ? null : row.closed_at.toISOString(),
	}));
}

function leafFirst(rows: PullBranchRow[]): PullBranchRow[] {
	const remaining = [...rows];
	const ordered: PullBranchRow[] = [];
	while (remaining.length > 0) {
		const leaves = remaining.filter(
			(row) =>
				!remaining.some(
					(other) => other.parent_pull_number === row.pull_number,
				),
		);
		if (leaves.length === 0) {
			ordered.push(...remaining);
			break;
		}
		ordered.push(...leaves);
		for (const leaf of leaves) {
			const index = remaining.indexOf(leaf);
			if (index >= 0) {
				remaining.splice(index, 1);
			}
		}
	}
	return ordered;
}

async function requireOriginToken(input: {
	config: Config;
	installationId: string;
}): Promise<string> {
	if (input.config.origin === null) {
		throw new Error(
			"ORIGIN_APP_ID and ORIGIN_PRIVATE_KEY_PEM are unset; cannot call Origin",
		);
	}
	return mintInstallationToken({
		origin: input.config.origin,
		installationId: input.installationId,
	});
}

export async function handleWebhook(input: {
	config: Config;
	sql: Sql;
	request: Request;
}): Promise<Response> {
	const raw = Buffer.from(await input.request.arrayBuffer());
	const headers = readWebhookHeaders(input.request.headers);
	if ("error" in headers) {
		return new Response(headers.error, { status: 401 });
	}
	const keys = await fetchOriginJwks();
	const verified = verifyWebhookSignature({
		body: raw,
		headers,
		keys,
	});
	if (!verified.ok) {
		return new Response(verified.error, { status: 401 });
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw.toString("utf8"));
	} catch {
		return new Response("webhook body is not JSON", { status: 400 });
	}

	const delivery = parseDelivery(parsed);
	const claim = await claimWebhookDelivery({
		sql: input.sql,
		webhookId: headers.id,
		eventType: delivery.event.type,
	});
	if (claim === "duplicate") {
		if (await webhookProcessed(input.sql, headers.id)) {
			return new Response("duplicate", { status: 200 });
		}
		return new Response("delivery still in progress", { status: 503 });
	}

	try {
		await dispatch({
			config: input.config,
			sql: input.sql,
			installationId: delivery.installationId,
			type: delivery.event.type,
			payload: delivery.event.payload,
		});
		await markWebhookProcessed(input.sql, headers.id);
		return new Response("ok", { status: 200 });
	} catch (error) {
		await releaseWebhookClaim(input.sql, headers.id);
		const message = error instanceof Error ? error.message : String(error);
		return new Response(message, { status: 500 });
	}
}

async function dispatch(input: {
	config: Config;
	sql: Sql;
	installationId: string;
	type: string;
	payload: unknown;
}): Promise<void> {
	if (input.type === INSTALL_EVENT) {
		await upsertInstallation({
			sql: input.sql,
			installationId: input.installationId,
		});
		return;
	}
	if (input.type === UNINSTALL_EVENT) {
		await uninstall({
			config: input.config,
			sql: input.sql,
			installationId: input.installationId,
		});
		return;
	}

	if (
		!ENSURE_EVENTS.has(input.type) &&
		!CLOSE_EVENTS.has(input.type) &&
		input.type !== RETARGET_EVENT
	) {
		return;
	}

	const event = parsePullEvent(input.payload);
	await upsertInstallation({
		sql: input.sql,
		installationId: input.installationId,
	});
	const projectId = neonProjectId(input.config);
	await upsertBinding({
		sql: input.sql,
		installationId: input.installationId,
		repositoryId: event.repository.id,
		ownerSlug: event.repository.ownerSlug,
		repoName: event.repository.name,
		neonProjectId: projectId,
	});

	const repo: RepoRef = {
		ownerSlug: event.repository.ownerSlug,
		repoName: event.repository.name,
	};
	const originToken = await requireOriginToken({
		config: input.config,
		installationId: input.installationId,
	});
	const apiKey = await neonApiKeyForInstall({
		config: input.config,
		sql: input.sql,
		installationId: input.installationId,
	});
	const storedRows = await listPullBranches(input.sql, event.repository.id);
	const stored = toStored(storedRows);
	const openPulls = await listOpenPulls({ token: originToken, repo });

	if (ENSURE_EVENTS.has(input.type)) {
		await runEnsure({
			config: input.config,
			sql: input.sql,
			installationId: input.installationId,
			projectId,
			apiKey,
			originToken,
			repo,
			event,
			stored,
			storedRows,
			openPulls,
		});
		return;
	}

	if (input.type === RETARGET_EVENT) {
		const plan = planRetarget({
			pullNumber: event.pull.number,
			baseRef: event.pull.baseRef,
			openPulls,
			stored,
		});
		if (plan.kind === "action_required") {
			await upsertCheck({
				token: originToken,
				repo,
				headSha: event.pull.headSha,
				check: {
					status: "completed",
					conclusion: "action_required",
					title: "Neon branch needs attention",
					summary: plan.reason,
				},
			});
			return;
		}
		const existing = storedRows.find(
			(row) => row.pull_number === event.pull.number,
		);
		if (existing === undefined) {
			return;
		}
		await upsertCheck({
			token: originToken,
			repo,
			headSha: event.pull.headSha,
			check: {
				status: "completed",
				conclusion: "success",
				title: "Neon branch ready",
				summary: `Branch ${existing.neon_branch_name} is unchanged.`,
				detailsUrl: `https://console.neon.tech/app/projects/${projectId}/branches/${existing.neon_branch_id}`,
			},
		});
		return;
	}

	await runClose({
		sql: input.sql,
		projectId,
		apiKey,
		event,
		stored,
	});
}

async function runEnsure(input: {
	config: Config;
	sql: Sql;
	installationId: string;
	projectId: string;
	apiKey: string;
	originToken: string;
	repo: RepoRef;
	event: ReturnType<typeof parsePullEvent>;
	stored: StoredPull[];
	storedRows: PullBranchRow[];
	openPulls: { number: string; headRef: string }[];
}): Promise<void> {
	await upsertCheck({
		token: input.originToken,
		repo: input.repo,
		headSha: input.event.pull.headSha,
		check: {
			status: "in_progress",
			title: "Creating Neon branch",
			summary: "Provisioning an isolated Neon branch for this pull request.",
		},
	});

	const plan = planEnsure({
		repositoryId: input.event.repository.id,
		pullNumber: input.event.pull.number,
		baseRef: input.event.pull.baseRef,
		allowlisted: repoAllowed(input.config, input.event.repository.id),
		openPulls: input.openPulls,
		stored: input.stored,
	});

	if (plan.kind === "action_required") {
		await upsertCheck({
			token: input.originToken,
			repo: input.repo,
			headSha: input.event.pull.headSha,
			check: {
				status: "completed",
				conclusion: "action_required",
				title: "Neon branch needs attention",
				summary: plan.reason,
			},
		});
		return;
	}

	let branchId: string;
	let branchName: string;
	if (plan.kind === "reuse") {
		branchId = plan.neonBranchId;
		branchName = plan.branchName;
	} else if (plan.kind === "create") {
		const parent =
			plan.parentPullNumber === null
				? undefined
				: input.storedRows.find(
						(row) =>
							row.pull_number === plan.parentPullNumber &&
							row.closed_at === null,
					);
		if (plan.parentPullNumber !== null && parent === undefined) {
			throw new Error(
				`parent pull ${plan.parentPullNumber} disappeared before create`,
			);
		}
		const created = await createPreviewBranch({
			apiKey: input.apiKey,
			projectId: input.projectId,
			name: plan.branchName,
			...(parent === undefined ? {} : { parentId: parent.neon_branch_id }),
		});
		branchId = created.branchId;
		branchName = created.branchName;
		await upsertPullBranch({
			sql: input.sql,
			repositoryId: input.event.repository.id,
			pullNumber: input.event.pull.number,
			installationId: input.installationId,
			neonProjectId: input.projectId,
			neonBranchId: branchId,
			neonBranchName: branchName,
			parentPullNumber: plan.parentPullNumber,
		});
	} else {
		const _exhaustive: never = plan;
		throw new Error(`unexpected ensure plan ${JSON.stringify(_exhaustive)}`);
	}

	const existing = input.storedRows.find(
		(row) => row.pull_number === input.event.pull.number,
	);
	const commentId = await upsertPrComment({
		token: input.originToken,
		repo: input.repo,
		pullNumber: input.event.pull.number,
		body: branchCommentBody({
			projectId: input.projectId,
			branchId,
			branchName,
		}),
		existingCommentId: existing?.origin_comment_id ?? null,
	});
	await setPullCommentId({
		sql: input.sql,
		repositoryId: input.event.repository.id,
		pullNumber: input.event.pull.number,
		commentId,
	});

	await upsertCheck({
		token: input.originToken,
		repo: input.repo,
		headSha: input.event.pull.headSha,
		check: {
			status: "completed",
			conclusion: "success",
			title: "Neon branch ready",
			summary: `Branch ${branchName} is ready. Use neon env pull against it.`,
			detailsUrl: `https://console.neon.tech/app/projects/${input.projectId}/branches/${branchId}`,
		},
	});
}

async function runClose(input: {
	sql: Sql;
	projectId: string;
	apiKey: string;
	event: ReturnType<typeof parsePullEvent>;
	stored: StoredPull[];
}): Promise<void> {
	const plan = planClose({
		pullNumber: input.event.pull.number,
		stored: input.stored,
	});
	await markPullClosed({
		sql: input.sql,
		repositoryId: input.event.repository.id,
		pullNumber: input.event.pull.number,
	});

	if (plan.kind === "close_keep") {
		return;
	}

	await deletePreviewBranch({
		apiKey: input.apiKey,
		projectId: input.projectId,
		branchId: plan.neonBranchId,
	});

	const afterClose = input.stored.map((row) =>
		row.pullNumber === input.event.pull.number
			? { ...row, closedAt: new Date().toISOString() }
			: row,
	);
	const ancestors = closedAncestorsToDelete({
		startPullNumber: input.event.pull.number,
		stored: afterClose,
	});
	for (const branchId of ancestors) {
		await deletePreviewBranch({
			apiKey: input.apiKey,
			projectId: input.projectId,
			branchId,
		});
	}
}

async function uninstall(input: {
	config: Config;
	sql: Sql;
	installationId: string;
}): Promise<void> {
	const rows = await listPullsForInstall(input.sql, input.installationId);
	if (input.config.labs !== null) {
		const apiKey = await neonApiKeyForInstall({
			config: input.config,
			sql: input.sql,
			installationId: input.installationId,
		}).catch(() => input.config.labs?.apiKey);
		if (apiKey !== undefined) {
			for (const row of leafFirst(rows)) {
				try {
					await deletePreviewBranch({
						apiKey,
						projectId: row.neon_project_id,
						branchId: row.neon_branch_id,
					});
				} catch {
					// Branch may already be gone; keep uninstalling the rest.
				}
			}
		}
	}
	await deletePullsForInstall(input.sql, input.installationId);
	const ciphertext = await revokeInstallation({
		sql: input.sql,
		installationId: input.installationId,
	});
	if (ciphertext !== null) {
		const refresh = decryptSecret(ciphertext, input.config.appSecret);
		await revokeOauthRefreshToken({
			config: input.config,
			refreshToken: refresh,
		});
	}
}
