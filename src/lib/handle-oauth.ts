import { oauthStart, resolvePublicBaseUrl, type Config } from "./config.ts";
import {
	consumeOauthState,
	insertOauthState,
	storeRefreshToken,
	upsertInstallation,
	type Sql,
} from "./db.ts";
import { html, json, redirect } from "./http.ts";
import { buildOauthStart, exchangeOauthCode } from "./oauth.ts";

export async function handleOauthStart(input: {
	config: Config;
	sql: Sql;
	url: URL;
}): Promise<Response> {
	const publicBaseUrl = resolvePublicBaseUrl(input.config, input.url);
	const start = oauthStart(input.config, publicBaseUrl);
	if (start.kind === "disabled") {
		return json(503, { error: start.reason });
	}
	const installationId = input.url.searchParams.get("installation_id");
	const built = await buildOauthStart(input.config, publicBaseUrl);
	await insertOauthState({
		sql: input.sql,
		state: built.state,
		codeVerifier: built.codeVerifier,
		...(installationId === null ? {} : { installationId }),
	});
	return redirect(built.authorizationUrl);
}

export async function handleOauthCallback(input: {
	config: Config;
	sql: Sql;
	url: URL;
}): Promise<Response> {
	const start = oauthStart(
		input.config,
		resolvePublicBaseUrl(input.config, input.url),
	);
	if (start.kind === "disabled") {
		return json(503, { error: start.reason });
	}
	const state = input.url.searchParams.get("state");
	if (state === null) {
		return json(400, { error: "callback is missing state" });
	}
	const stored = await consumeOauthState({ sql: input.sql, state });
	const tokens = await exchangeOauthCode({
		config: input.config,
		callbackUrl: input.url,
		codeVerifier: stored.codeVerifier,
		expectedState: state,
	});
	if (stored.installationId !== null) {
		await upsertInstallation({
			sql: input.sql,
			installationId: stored.installationId,
		});
		await storeRefreshToken({
			sql: input.sql,
			installationId: stored.installationId,
			refreshToken: tokens.refreshToken,
			appSecret: input.config.appSecret,
		});
	}
	return html(
		200,
		`<!doctype html><meta charset="utf-8"><title>Neon connected</title><p>Neon OAuth completed. You can close this tab.</p>`,
	);
}
