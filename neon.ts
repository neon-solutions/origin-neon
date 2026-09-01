import { defineConfig } from "@neon/config/v1";

export default defineConfig({
	preview: {
		functions: {
			originneon: {
				name: "origin-neon",
				source: "src/index.ts",
				dev: { port: 8787 },
				env: {
					APP_SECRET: process.env.APP_SECRET!,
					PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL!,
					NEON_API_KEY: process.env.NEON_API_KEY!,
					NEON_PROJECT_ID: process.env.NEON_PROJECT_ID!,
					ORIGIN_REPO_ALLOWLIST: process.env.ORIGIN_REPO_ALLOWLIST!,
					ORIGIN_APP_ID: process.env.ORIGIN_APP_ID!,
					ORIGIN_PRIVATE_KEY_PEM: process.env.ORIGIN_PRIVATE_KEY_PEM!,
					ORIGIN_KEY_ID: process.env.ORIGIN_KEY_ID!,
					NEON_OAUTH_HOST:
						process.env.NEON_OAUTH_HOST ?? "https://oauth2.neon.tech",
					NEON_OAUTH_CLIENT_ID: process.env.NEON_OAUTH_CLIENT_ID!,
					NEON_OAUTH_REDIRECT_URI: process.env.NEON_OAUTH_REDIRECT_URI!,
					SENTRY_DSN: process.env.SENTRY_DSN!,
					SENTRY_RELEASE: process.env.SENTRY_RELEASE!,
					SENTRY_TRACES_SAMPLE_RATE:
						process.env.SENTRY_TRACES_SAMPLE_RATE ?? "1",
					PRODUCTION_BRANCH: process.env.PRODUCTION_BRANCH ?? "main",
				},
			},
		},
	},
});
