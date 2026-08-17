import { isRecord, readRecord, readString } from "./json.ts";

export type Delivery = {
	deliveryId: string;
	appId: string;
	installationId: string;
	event: {
		id: string;
		type: string;
		payload: unknown;
	};
};

export type PullSnapshot = {
	number: string;
	headRef: string;
	headSha: string;
	baseRef: string;
};

export type RepoSnapshot = {
	id: string;
	name: string;
	ownerSlug: string;
};

export type PullEvent = {
	pull: PullSnapshot;
	repository: RepoSnapshot;
};

export function parseDelivery(body: unknown): Delivery {
	if (!isRecord(body)) {
		throw new Error("webhook body is not an object");
	}
	const deliveryId = readString(body, "deliveryId");
	const appId = readString(body, "appId");
	const installationId = readString(body, "installationId");
	const event = readRecord(body, "event");
	if (
		deliveryId === undefined ||
		appId === undefined ||
		installationId === undefined ||
		event === undefined
	) {
		throw new Error("webhook envelope is missing delivery, app, or event");
	}
	const eventId = readString(event, "id");
	const type = readString(event, "type");
	if (eventId === undefined || type === undefined) {
		throw new Error("webhook event is missing id or type");
	}
	return {
		deliveryId,
		appId,
		installationId,
		event: {
			id: eventId,
			type,
			payload: event.payload,
		},
	};
}

function parseRepo(value: unknown): RepoSnapshot {
	if (!isRecord(value)) {
		throw new Error("repository is missing");
	}
	const id = readString(value, "id");
	const name = readString(value, "name");
	const owner = readRecord(value, "owner");
	const ownerSlug = owner === undefined ? undefined : readString(owner, "slug");
	if (id === undefined || name === undefined || ownerSlug === undefined) {
		throw new Error("repository is missing id, name, or owner.slug");
	}
	return { id, name, ownerSlug };
}

function parsePull(value: unknown): PullSnapshot {
	if (!isRecord(value)) {
		throw new Error("pullRequest is missing");
	}
	const number = readString(value, "number");
	const head = readRecord(value, "head");
	const base = readRecord(value, "base");
	const headRef = head === undefined ? undefined : readString(head, "ref");
	const headSha = head === undefined ? undefined : readString(head, "sha");
	const baseRef = base === undefined ? undefined : readString(base, "ref");
	if (
		number === undefined ||
		headRef === undefined ||
		headSha === undefined ||
		baseRef === undefined
	) {
		throw new Error("pullRequest is missing number, head, or base");
	}
	return { number, headRef, headSha, baseRef };
}

export function parsePullEvent(payload: unknown): PullEvent {
	if (!isRecord(payload)) {
		throw new Error("pull request payload is not an object");
	}
	return {
		pull: parsePull(payload.pullRequest),
		repository: parseRepo(payload.repository),
	};
}

export const ENSURE_EVENTS = new Set([
	"pull_request.created",
	"pull_request.reopened",
	"pull_request.published",
	"pull_request.head_ref.pushed",
]);

export const CLOSE_EVENTS = new Set([
	"pull_request.closed",
	"pull_request.merged",
]);

export const RETARGET_EVENT = "pull_request.base_ref.updated";
export const UNINSTALL_EVENT = "installation.deleted";
export const INSTALL_EVENT = "installation.created";
