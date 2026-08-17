import { importPKCS8, SignJWT } from "jose";
import { isRecord, readString } from "./json.ts";
import type { OriginConfig } from "./config.ts";
import type { OpenPull } from "./stack.ts";

export const ORIGIN_API = "https://api.cursor.com/v1/origin";

export const CHECK_SUITE_KEY = "neon";
export const CHECK_RUN_KEY = "branch";
export const CHECK_SUITE_NAME = "Neon";
export const CHECK_RUN_NAME = "Neon branch";

export type RepoRef = {
	ownerSlug: string;
	repoName: string;
};

export type CheckStatus =
	| { status: "in_progress"; title: string; summary: string }
	| {
			status: "completed";
			conclusion: "success" | "failure" | "action_required";
			title: string;
			summary: string;
			detailsUrl?: string;
	  };

async function appJwt(origin: OriginConfig): Promise<string> {
	const key = await importPKCS8(origin.privateKeyPem, "EdDSA");
	return new SignJWT({})
		.setProtectedHeader({
			alg: "EdDSA",
			kid: origin.keyId,
			typ: "JWT",
		})
		.setIssuer(origin.appId)
		.setAudience("origin-apps")
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(key);
}

async function originFetch(input: {
	path: string;
	token: string;
	method?: string;
	body?: unknown;
}): Promise<unknown> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${input.token}`,
		Accept: "application/json",
	};
	const init: RequestInit =
		input.body === undefined
			? { method: input.method ?? "GET", headers }
			: {
					method: input.method ?? "GET",
					headers: {
						...headers,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(input.body),
				};
	const response = await fetch(`${ORIGIN_API}${input.path}`, init);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`Origin ${input.method ?? "GET"} ${input.path} returned ${response.status}: ${text}`,
		);
	}
	if (text.length === 0) {
		return null;
	}
	const parsed: unknown = JSON.parse(text);
	return parsed;
}

export async function mintInstallationToken(input: {
	origin: OriginConfig;
	installationId: string;
}): Promise<string> {
	const jwt = await appJwt(input.origin);
	const body = await originFetch({
		path: `/app/installations/${encodeURIComponent(input.installationId)}/access_tokens`,
		token: jwt,
		method: "POST",
		body: {},
	});
	if (!isRecord(body)) {
		throw new Error("Create Installation Access Token returned a non-object");
	}
	const token = readString(body, "token");
	if (token === undefined) {
		throw new Error("Create Installation Access Token returned no token");
	}
	return token;
}

export async function listOpenPulls(input: {
	token: string;
	repo: RepoRef;
}): Promise<OpenPull[]> {
	const pulls: OpenPull[] = [];
	let pageToken: string | undefined;
	for (;;) {
		const params = new URLSearchParams({
			state: "open",
			pageSize: "100",
		});
		if (pageToken !== undefined) {
			params.set("pageToken", pageToken);
		}
		const body = await originFetch({
			path: `/repos/${encodeURIComponent(input.repo.ownerSlug)}/${encodeURIComponent(input.repo.repoName)}/pulls?${params}`,
			token: input.token,
		});
		if (!isRecord(body) || !Array.isArray(body.pullRequests)) {
			throw new Error("List Pull Requests returned no pullRequests");
		}
		for (const item of body.pullRequests) {
			if (!isRecord(item)) {
				continue;
			}
			const number = readString(item, "number");
			const head = isRecord(item.head)
				? readString(item.head, "ref")
				: undefined;
			if (number === undefined || head === undefined) {
				continue;
			}
			pulls.push({ number, headRef: head });
		}
		const next =
			typeof body.nextPageToken === "string" && body.nextPageToken.length > 0
				? body.nextPageToken
				: undefined;
		if (next === undefined) {
			break;
		}
		pageToken = next;
	}
	return pulls;
}

export async function upsertCheck(input: {
	token: string;
	repo: RepoRef;
	headSha: string;
	check: CheckStatus;
}): Promise<void> {
	const now = new Date().toISOString();
	const attemptId = crypto.randomUUID();
	const checkRun: Record<string, unknown> = {
		key: CHECK_RUN_KEY,
		name: CHECK_RUN_NAME,
		status: input.check.status,
		externalUpdatedAt: now,
		externalId: attemptId,
		output: {
			title: input.check.title,
			summary: input.check.summary,
		},
	};
	if (input.check.status === "completed") {
		checkRun.conclusion = input.check.conclusion;
		checkRun.completedAt = now;
		if (input.check.detailsUrl !== undefined) {
			checkRun.detailsUrl = input.check.detailsUrl;
		}
	} else {
		checkRun.startedAt = now;
	}

	await originFetch({
		path: `/repos/${encodeURIComponent(input.repo.ownerSlug)}/${encodeURIComponent(input.repo.repoName)}/check-runs`,
		token: input.token,
		method: "POST",
		body: {
			headSha: input.headSha,
			checkSuite: {
				key: CHECK_SUITE_KEY,
				name: CHECK_SUITE_NAME,
				externalId: attemptId,
			},
			checkRun,
		},
	});
}

export async function upsertPrComment(input: {
	token: string;
	repo: RepoRef;
	pullNumber: string;
	body: string;
	existingCommentId: string | null;
}): Promise<string> {
	if (input.existingCommentId !== null) {
		const updated = await originFetch({
			path: `/repos/${encodeURIComponent(input.repo.ownerSlug)}/${encodeURIComponent(input.repo.repoName)}/pulls/comments/${encodeURIComponent(input.existingCommentId)}`,
			token: input.token,
			method: "PATCH",
			body: { body: input.body },
		});
		if (isRecord(updated)) {
			const id = readString(updated, "id");
			if (id !== undefined) {
				return id;
			}
		}
		throw new Error("Update Pull Request Comment returned no id");
	}
	const created = await originFetch({
		path: `/repos/${encodeURIComponent(input.repo.ownerSlug)}/${encodeURIComponent(input.repo.repoName)}/pulls/${encodeURIComponent(input.pullNumber)}/comments`,
		token: input.token,
		method: "POST",
		body: { body: input.body },
	});
	if (!isRecord(created)) {
		throw new Error("Create Pull Request Comment returned a non-object");
	}
	const id = readString(created, "id");
	if (id === undefined) {
		throw new Error("Create Pull Request Comment returned no id");
	}
	return id;
}

export function consoleBranchUrl(input: {
	projectId: string;
	branchId: string;
}): string {
	return `https://console.neon.tech/app/projects/${input.projectId}/branches/${input.branchId}`;
}

export function branchCommentBody(input: {
	projectId: string;
	branchId: string;
	branchName: string;
}): string {
	const url = consoleBranchUrl(input);
	return `Neon branch \`${input.branchName}\` is ready.\n\n${url}`;
}
