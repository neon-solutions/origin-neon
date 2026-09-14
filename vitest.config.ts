import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const localEnv = fileURLToPath(new URL("./.env.local", import.meta.url));
if (existsSync(localEnv)) {
	loadEnvFile(localEnv);
}
process.env.SENTRY_ENABLED = "false";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts", "test/**/*.test.ts", "scripts/**/*.test.ts"],
		exclude: ["test/e2e/**"],
	},
});
