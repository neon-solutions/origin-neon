import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts", "test/**/*.test.ts", "scripts/**/*.test.ts"],
		exclude: ["test/e2e/**"],
	},
});
