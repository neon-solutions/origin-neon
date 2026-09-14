import { execFileSync } from "node:child_process";

execFileSync("neon", ["dev", ...process.argv.slice(2)], {
	env: { ...process.env, SENTRY_ENABLED: "false" },
	stdio: "inherit",
});
