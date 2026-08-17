import type { Config } from "./config.ts";
import { readRefreshToken, storeRefreshToken, type Sql } from "./db.ts";
import { refreshOauthToken } from "./oauth.ts";

export async function neonApiKeyForInstall(input: {
	config: Config;
	sql: Sql;
	installationId: string;
}): Promise<string> {
	const refresh = await readRefreshToken({
		sql: input.sql,
		installationId: input.installationId,
		appSecret: input.config.appSecret,
	});
	if (refresh !== null) {
		const tokens = await refreshOauthToken({
			config: input.config,
			refreshToken: refresh,
		});
		await storeRefreshToken({
			sql: input.sql,
			installationId: input.installationId,
			refreshToken: tokens.refreshToken,
			appSecret: input.config.appSecret,
		});
		return tokens.accessToken;
	}
	if (input.config.labs !== null) {
		return input.config.labs.apiKey;
	}
	throw new Error(
		"no Neon credentials: set NEON_API_KEY + NEON_PROJECT_ID or complete Neon OAuth",
	);
}

export function neonProjectId(config: Config): string {
	if (config.labs === null) {
		throw new Error("NEON_PROJECT_ID is unset");
	}
	return config.labs.projectId;
}
