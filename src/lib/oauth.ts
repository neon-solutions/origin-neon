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

export async function exchangeOauthCode(input: {
	config: Config;
	callbackUrl: URL;
	codeVerifier: string;
	expectedState: string;
}): Promise<OauthTokens> {
	const start = oauthStart(input.config, input.callbackUrl.origin);
	if (start.kind === "disabled") {
		throw new Error(start.reason);
	}
	const configuration = await discover({
		host: start.host,
		clientId: start.clientId,
	});
	const tokenSet = await client.authorizationCodeGrant(
		configuration,
		input.callbackUrl,
		{
			pkceCodeVerifier: input.codeVerifier,
			expectedState: input.expectedState,
		},
	);
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
