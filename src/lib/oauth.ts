import * as client from "openid-client";
import { oauthStart, type Config } from "./config.ts";

const SERVER_TIMEOUT_MS = 10_000;

export const NEON_OAUTH_SCOPES = [
	"openid",
	"offline",
	"offline_access",
	"urn:neoncloud:projects:read",
	"urn:neoncloud:projects:update",
] as const;

export type OauthStartRequest = {
	authorizationUrl: string;
	state: string;
	codeVerifier: string;
};

async function discover(input: {
	host: string;
	clientId: string;
}): Promise<client.Configuration> {
	return client.discovery(
		new URL(input.host),
		input.clientId,
		{ token_endpoint_auth_method: "none" },
		client.None(),
		{ timeout: SERVER_TIMEOUT_MS },
	);
}

export async function buildOauthStart(
	config: Config,
	publicBaseUrl?: string,
): Promise<OauthStartRequest> {
	const start = oauthStart(config, publicBaseUrl);
	if (start.kind === "disabled") {
		throw new Error(start.reason);
	}
	const configuration = await discover({
		host: start.host,
		clientId: start.clientId,
	});
	const state = client.randomState();
	const codeVerifier = client.randomPKCECodeVerifier();
	const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
	const authorizationUrl = client.buildAuthorizationUrl(configuration, {
		scope: NEON_OAUTH_SCOPES.join(" "),
		state,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
		redirect_uri: start.redirectUri,
	});
	return {
		authorizationUrl: authorizationUrl.href,
		state,
		codeVerifier,
	};
}

export type OauthTokens = {
	accessToken: string;
	refreshToken: string;
	expiresIn: number | undefined;
};

function requireRefreshToken(
	tokenSet: client.TokenEndpointResponse,
): OauthTokens {
	if (typeof tokenSet.access_token !== "string") {
		throw new Error("Neon OAuth token response is missing access_token");
	}
	if (typeof tokenSet.refresh_token !== "string") {
		throw new Error("Neon OAuth token response is missing refresh_token");
	}
	return {
		accessToken: tokenSet.access_token,
		refreshToken: tokenSet.refresh_token,
		expiresIn:
			typeof tokenSet.expires_in === "number" ? tokenSet.expires_in : undefined,
	};
}

export class OauthTokenExchangeError extends Error {
	readonly oauthError: string;
	readonly oauthErrorDescription: string | null;
	readonly redirectUri: string;
	readonly requestOrigin: string;

	constructor(input: {
		oauthError: string;
		oauthErrorDescription: string | null;
		redirectUri: string;
		requestOrigin: string;
	}) {
		super("oauth_token_exchange_failed");
		this.name = "OauthTokenExchangeError";
		this.oauthError = input.oauthError;
		this.oauthErrorDescription = input.oauthErrorDescription;
		this.redirectUri = input.redirectUri;
		this.requestOrigin = input.requestOrigin;
	}
}

// Hydra requires the same redirect_uri for authorization and token exchange.
// Functions may expose an internal request origin after TLS termination.
export function callbackUrlForTokenExchange(
	registeredRedirectUri: string,
	incoming: URL,
): URL {
	const callback = new URL(registeredRedirectUri);
	callback.search = incoming.search;
	return callback;
}

export async function exchangeOauthCode(input: {
	config: Config;
	callbackUrl: URL;
	registeredRedirectUri: string;
	codeVerifier: string;
	expectedState: string;
}): Promise<OauthTokens> {
	const configuration = await discover({
		host: input.config.oauth.host,
		clientId: input.config.oauth.clientId,
	});
	const grantUrl = callbackUrlForTokenExchange(
		input.registeredRedirectUri,
		input.callbackUrl,
	);
	let tokenSet: client.TokenEndpointResponse;
	try {
		tokenSet = await client.authorizationCodeGrant(configuration, grantUrl, {
			pkceCodeVerifier: input.codeVerifier,
			expectedState: input.expectedState,
		});
	} catch (error) {
		if (error instanceof client.ResponseBodyError) {
			throw new OauthTokenExchangeError({
				oauthError: error.error,
				oauthErrorDescription: error.error_description ?? null,
				redirectUri: input.registeredRedirectUri,
				requestOrigin: input.callbackUrl.origin,
			});
		}
		throw error;
	}
	return requireRefreshToken(tokenSet);
}

export async function refreshOauthToken(input: {
	config: Config;
	refreshToken: string;
}): Promise<OauthTokens> {
	const configuration = await discover({
		host: input.config.oauth.host,
		clientId: input.config.oauth.clientId,
	});
	const tokenSet = await client.refreshTokenGrant(
		configuration,
		input.refreshToken,
	);
	return requireRefreshToken(tokenSet);
}

export async function revokeOauthRefreshToken(input: {
	config: Config;
	refreshToken: string;
}): Promise<boolean> {
	try {
		const configuration = await discover({
			host: input.config.oauth.host,
			clientId: input.config.oauth.clientId,
		});
		await client.tokenRevocation(configuration, input.refreshToken, {
			token_type_hint: "refresh_token",
		});
		return true;
	} catch {
		return false;
	}
}
