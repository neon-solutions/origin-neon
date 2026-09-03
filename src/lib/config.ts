export type Config = {
	appSecret: string;
	publicBaseUrl: string | null;
	databaseUrl: string;
	labs: LabsConfig | null;
	origin: OriginConfig | null;
	oauth: OauthConfig;
	analyticsWriteKey: string | undefined;
};

export type LabsConfig = {
	apiKey: string;
	projectId: string;
	repoAllowlist: string[];
};

export type OriginConfig = {
	appId: string;
	privateKeyPem: string;
	keyId: string;
};

export type OauthConfig = {
	host: string;
	clientId: string;
	redirectUri: string | null;
};

const DEFAULT_OAUTH_HOST = "https://oauth2.neon.tech";
const CLI_CLIENT_ID = "neonctl";

function optional(env: NodeJS.ProcessEnv, key: string): string | undefined {
	const value = env[key];
	if (value === undefined || value === "") {
		return undefined;
	}
	return value;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
	const value = optional(env, key);
	if (value === undefined) {
		throw new Error(`${key} is unset`);
	}
	return value;
}

function parseAllowlist(raw: string | undefined): string[] {
	if (raw === undefined) {
		return [];
	}
	return raw
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

function isLoopback(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const appSecret = required(env, "APP_SECRET");
	if (appSecret.length < 16) {
		throw new Error("APP_SECRET must be at least 16 characters");
	}

	const publicBaseUrlRaw = optional(env, "PUBLIC_BASE_URL");
	const publicBaseUrl =
		publicBaseUrlRaw === undefined ? null : publicBaseUrlRaw.replace(/\/$/, "");
	const databaseUrl = required(env, "DATABASE_URL");

	const labsKey = optional(env, "NEON_API_KEY");
	const labsProject = optional(env, "NEON_PROJECT_ID");
	let labs: LabsConfig | null = null;
	if (labsKey !== undefined || labsProject !== undefined) {
		if (labsKey === undefined || labsProject === undefined) {
			throw new Error("NEON_API_KEY and NEON_PROJECT_ID must be set together");
		}
		labs = {
			apiKey: labsKey,
			projectId: labsProject,
			repoAllowlist: parseAllowlist(optional(env, "ORIGIN_REPO_ALLOWLIST")),
		};
	}

	const originAppId = optional(env, "ORIGIN_APP_ID");
	const originPem = optional(env, "ORIGIN_PRIVATE_KEY_PEM");
	let origin: OriginConfig | null = null;
	if (originAppId !== undefined || originPem !== undefined) {
		if (originAppId === undefined || originPem === undefined) {
			throw new Error(
				"ORIGIN_APP_ID and ORIGIN_PRIVATE_KEY_PEM must be set together",
			);
		}
		origin = {
			appId: originAppId,
			privateKeyPem: originPem.replace(/\\n/g, "\n"),
			keyId: optional(env, "ORIGIN_KEY_ID") ?? originAppId,
		};
	}

	const oauthHost = optional(env, "NEON_OAUTH_HOST") ?? DEFAULT_OAUTH_HOST;
	const configuredClient = optional(env, "NEON_OAUTH_CLIENT_ID");
	const configuredRedirect = optional(env, "NEON_OAUTH_REDIRECT_URI");
	const clientId = configuredClient ?? CLI_CLIENT_ID;
	const analyticsRaw = optional(env, "ANALYTICS_WRITE_KEY")?.trim();
	const analyticsWriteKey =
		analyticsRaw === undefined || analyticsRaw === ""
			? undefined
			: analyticsRaw;

	return {
		appSecret,
		publicBaseUrl,
		databaseUrl,
		labs,
		origin,
		oauth: {
			host: oauthHost,
			clientId,
			redirectUri: configuredRedirect ?? null,
		},
		analyticsWriteKey,
	};
}

export type OauthStart =
	| { kind: "disabled"; reason: string }
	| { kind: "enabled"; clientId: string; redirectUri: string; host: string };

export function resolvePublicBaseUrl(config: Config, requestUrl: URL): string {
	return config.publicBaseUrl ?? requestUrl.origin;
}

export function oauthStart(config: Config, publicBaseUrl?: string): OauthStart {
	const { clientId, host } = config.oauth;
	const base = publicBaseUrl ?? config.publicBaseUrl ?? undefined;
	const redirectUri =
		config.oauth.redirectUri ??
		(base === undefined ? undefined : `${base}/oauth/neon/callback`);
	if (redirectUri === undefined) {
		return {
			kind: "disabled",
			reason: "no public base URL to build the OAuth redirect from",
		};
	}
	if (clientId === CLI_CLIENT_ID && !isLoopback(redirectUri)) {
		return {
			kind: "disabled",
			reason:
				"client_id neonctl is only valid for a loopback redirect. Register a Neon OAuth client and set NEON_OAUTH_CLIENT_ID plus the exact callback URL.",
		};
	}
	return { kind: "enabled", clientId, redirectUri, host };
}

export function repoAllowed(config: Config, repositoryId: string): boolean {
	if (config.labs === null) {
		return false;
	}
	return config.labs.repoAllowlist.includes(repositoryId);
}

export const CLI_OAUTH_CLIENT_ID = CLI_CLIENT_ID;
