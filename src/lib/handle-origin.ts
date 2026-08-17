import { randomBytes } from "node:crypto";
import { oauthStart, resolvePublicBaseUrl, type Config } from "./config.ts";
import {
	consumeOauthState,
	insertOauthState,
	upsertInstallation,
	type Sql,
} from "./db.ts";
import { html, json, redirect } from "./http.ts";
import { verifyInstallationReceipt } from "./receipt.ts";
import { fetchOriginJwks } from "./webhook.ts";

const ORIGIN_INSTALL_SCOPES = [
	"repository:pull_requests:read",
	"repository:pull_requests:reviews:write",
	"repository:checks:write",
].join(" ");

export async function handleOriginInstall(input: {
	config: Config;
	sql: Sql;
	url: URL;
}): Promise<Response> {
	if (input.config.origin === null) {
		return json(503, {
			error: "ORIGIN_APP_ID and ORIGIN_PRIVATE_KEY_PEM are unset",
		});
	}
	const state = randomBytes(16).toString("hex");
	await insertOauthState({
		sql: input.sql,
		state,
		codeVerifier: "origin-install",
	});
	const publicBaseUrl = resolvePublicBaseUrl(input.config, input.url);
	const url = new URL("https://cursor.com/codebase/apps/install");
	url.searchParams.set("client_id", input.config.origin.appId);
	url.searchParams.set("scope", ORIGIN_INSTALL_SCOPES);
	url.searchParams.set("redirect_uri", `${publicBaseUrl}/origin/callback`);
	url.searchParams.set("state", state);
	url.searchParams.set(
		"summary",
		"Create a Neon branch for each Origin pull request",
	);
	return redirect(url.href);
}

export async function handleOriginCallback(input: {
	config: Config;
	sql: Sql;
	url: URL;
}): Promise<Response> {
	if (input.config.origin === null) {
		return json(503, {
			error: "ORIGIN_APP_ID and ORIGIN_PRIVATE_KEY_PEM are unset",
		});
	}
	const token = input.url.searchParams.get("installation_receipt");
	if (token === null) {
		return json(400, { error: "callback is missing installation_receipt" });
	}
	const keys = await fetchOriginJwks();
	const receipt = await verifyInstallationReceipt({
		token,
		appId: input.config.origin.appId,
		keys,
	});
	if (receipt.state !== undefined) {
		const stored = await consumeOauthState({
			sql: input.sql,
			state: receipt.state,
		});
		if (stored.codeVerifier !== "origin-install") {
			return json(400, {
				error: "installation state is not an Origin install",
			});
		}
	}
	await upsertInstallation({
		sql: input.sql,
		installationId: receipt.installationId,
		...(receipt.namespaceId === undefined
			? {}
			: { namespaceId: receipt.namespaceId }),
	});

	const neon = oauthStart(
		input.config,
		resolvePublicBaseUrl(input.config, input.url),
	);
	if (neon.kind === "enabled") {
		return redirect(
			`/oauth/neon/start?installation_id=${encodeURIComponent(receipt.installationId)}`,
		);
	}

	return html(
		200,
		`<!doctype html><meta charset="utf-8"><title>Origin installed</title><p>Origin installation ${receipt.installationId} is stored. Neon OAuth is disabled on this host; labs uses NEON_API_KEY.</p>`,
	);
}
