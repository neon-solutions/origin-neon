import { describe, expect, it } from "vitest";
import { loadConfig, oauthStart } from "./config.ts";

const base = {
	APP_SECRET: "sixteen-chars-ok",
	PUBLIC_BASE_URL: "https://originneon.example.neon.app",
	DATABASE_URL: "postgres://user:pass@host/db",
};

describe("oauthStart", () => {
	it("disables neonctl on a public HTTPS callback", () => {
		const config = loadConfig({
			...base,
			NEON_OAUTH_CLIENT_ID: "neonctl",
		});
		const start = oauthStart(config);
		expect(start.kind).toBe("disabled");
	});

	it("allows neonctl on loopback", () => {
		const config = loadConfig({
			...base,
			PUBLIC_BASE_URL: "http://127.0.0.1:8787",
			NEON_OAUTH_CLIENT_ID: "neonctl",
		});
		const start = oauthStart(config);
		expect(start).toEqual({
			kind: "enabled",
			clientId: "neonctl",
			redirectUri: "http://127.0.0.1:8787/oauth/neon/callback",
			host: "https://oauth2.neon.tech",
		});
	});

	it("allows a registered client on HTTPS", () => {
		const config = loadConfig({
			...base,
			NEON_OAUTH_CLIENT_ID: "origin-neon",
			NEON_OAUTH_REDIRECT_URI:
				"https://originneon.example.neon.app/oauth/neon/callback",
		});
		const start = oauthStart(config);
		expect(start.kind).toBe("enabled");
		if (start.kind === "enabled") {
			expect(start.clientId).toBe("origin-neon");
		}
	});
});

describe("loadConfig", () => {
	it("loads without PUBLIC_BASE_URL", () => {
		const config = loadConfig({
			APP_SECRET: "sixteen-chars-ok",
			DATABASE_URL: "postgres://user:pass@host/db",
		});
		expect(config.publicBaseUrl).toBeNull();
	});

	it("requires APP_SECRET", () => {
		expect(() =>
			loadConfig({
				PUBLIC_BASE_URL: "http://127.0.0.1:8787",
				DATABASE_URL: "postgres://x",
			}),
		).toThrow(/APP_SECRET/);
	});

	it("requires NEON_API_KEY and NEON_PROJECT_ID together", () => {
		expect(() =>
			loadConfig({
				...base,
				NEON_API_KEY: "napi_x",
			}),
		).toThrow(/together/);
	});
});
