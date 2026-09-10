import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	REQUIRED_FUNCTION_ENV,
	assertGitSha,
	assertNoLiveOnlyEnv,
	assertRegularEnvFile,
	declaredUploadKeys,
	liveOnlyEnvNames,
	neonChildEnv,
	neonDeployArgs,
	parseDeployArgv,
	parseLiveFunctionEnvNames,
	readEnvAssignments,
	upsertEnvAssignment,
} from "./deploy-prep.ts";

describe("assertGitSha", () => {
	it("accepts a short git sha", () => {
		expect(assertGitSha("0097076")).toBe("0097076");
	});

	it("rejects empty and non-hex", () => {
		expect(() => assertGitSha("")).toThrow(/SENTRY_RELEASE/);
		expect(() => assertGitSha("not a sha")).toThrow(/SENTRY_RELEASE/);
	});
});

describe("upsertEnvAssignment", () => {
	it("appends a missing release assignment", () => {
		const next = upsertEnvAssignment(
			"APP_SECRET=abc\n",
			"SENTRY_RELEASE",
			"0097076",
		);
		expect(next).toBe("APP_SECRET=abc\nSENTRY_RELEASE=0097076\n");
	});

	it("replaces an existing release assignment", () => {
		const next = upsertEnvAssignment(
			"SENTRY_RELEASE=old\nAPP_SECRET=abc\n",
			"SENTRY_RELEASE",
			"0097076",
		);
		expect(next).toBe("SENTRY_RELEASE=0097076\nAPP_SECRET=abc\n");
	});

	it("replaces export and quoted assignments", () => {
		const next = upsertEnvAssignment(
			'export SENTRY_RELEASE="old"\n',
			"SENTRY_RELEASE",
			"0097076",
		);
		expect(next).toBe("SENTRY_RELEASE=0097076\n");
	});

	it("keeps unrelated keys, comments, and quoted secrets", () => {
		const original = [
			"# prod",
			'ORIGIN_PRIVATE_KEY_PEM="tok=en#1"',
			"PUBLIC_BASE_URL=https://example.test",
			"",
		].join("\n");
		const next = upsertEnvAssignment(original, "SENTRY_RELEASE", "abc1234");
		expect(next).toContain("# prod");
		expect(next).toContain('ORIGIN_PRIVATE_KEY_PEM="tok=en#1"');
		expect(next).toContain("PUBLIC_BASE_URL=https://example.test");
		expect(next).toContain("SENTRY_RELEASE=abc1234");
	});

	it("rejects duplicate release assignments", () => {
		expect(() =>
			upsertEnvAssignment(
				"SENTRY_RELEASE=a\nSENTRY_RELEASE=b\n",
				"SENTRY_RELEASE",
				"0097076",
			),
		).toThrow(/duplicate/);
	});
});

describe("neonChildEnv", () => {
	const fileEnv = Object.fromEntries(
		REQUIRED_FUNCTION_ENV.map((key) => [key, `file-${key}`]),
	);

	it("file values win over inherited Function env", () => {
		const child = neonChildEnv({
			fileEnv,
			inherited: {
				PATH: "/bin",
				SENTRY_RELEASE: "",
				APP_SECRET: "shell-token",
			},
		});
		expect(child.SENTRY_RELEASE).toBe("file-SENTRY_RELEASE");
		expect(child.APP_SECRET).toBe("file-APP_SECRET");
		expect(child.PATH).toBe("/bin");
	});

	it("missing required keys fail even when the shell has them", () => {
		const incomplete = { ...fileEnv };
		delete incomplete.SENTRY_DSN;
		expect(() =>
			neonChildEnv({
				fileEnv: incomplete,
				inherited: { SENTRY_DSN: "from-shell" },
			}),
		).toThrow(/SENTRY_DSN/);
	});

	it("empty required file values fail", () => {
		expect(() =>
			neonChildEnv({
				fileEnv: { ...fileEnv, APP_SECRET: "" },
				inherited: { APP_SECRET: "from-shell" },
			}),
		).toThrow(/APP_SECRET/);
	});
});

describe("neonDeployArgs", () => {
	it("plan uses config plan without --update-existing", () => {
		expect(neonDeployArgs({ plan: true, envFile: ".env.prod" })).toEqual([
			"config",
			"plan",
			"--profile",
			"dbx",
			"--branch",
			"main",
			"--env",
			".env.prod",
		]);
	});

	it("apply uses deploy without --update-existing or --allow-protected", () => {
		const args = neonDeployArgs({ plan: false, envFile: ".env.prod" });
		expect(args).toEqual([
			"deploy",
			"--profile",
			"dbx",
			"--branch",
			"main",
			"--env",
			".env.prod",
		]);
		expect(args.includes("--update-existing")).toBe(false);
		expect(args.includes("--allow-protected")).toBe(false);
	});
});

describe("parseDeployArgv", () => {
	it("no arguments means apply", () => {
		expect(parseDeployArgv([])).toEqual({ kind: "apply" });
	});

	it("only --plan means plan", () => {
		expect(parseDeployArgv(["--plan"])).toEqual({ kind: "plan" });
	});

	it("only --help means help", () => {
		expect(parseDeployArgv(["--help"])).toEqual({ kind: "help" });
	});

	it("unknown or extra arguments fail", () => {
		expect(() => parseDeployArgv(["--plna"])).toThrow(
			/unknown deploy arguments/,
		);
		expect(() => parseDeployArgv(["--dry-run"])).toThrow(
			/unknown deploy arguments/,
		);
		expect(() => parseDeployArgv(["--plan", "--help"])).toThrow(
			/unknown deploy arguments/,
		);
	});
});

describe("assertRegularEnvFile", () => {
	it("rejects a missing file and a symlink", () => {
		const dir = mkdtempSync(join(tmpdir(), "origin-neon-deploy-"));
		const missing = join(dir, ".env.prod");
		expect(() => assertRegularEnvFile(missing)).toThrow(/not found/);
		const target = join(dir, "real");
		const link = join(dir, "link");
		writeFileSync(target, "SENTRY_RELEASE=abc\n");
		symlinkSync(target, link);
		expect(() => assertRegularEnvFile(link)).toThrow(/symlink/);
	});

	it("accepts a regular file", () => {
		const dir = mkdtempSync(join(tmpdir(), "origin-neon-deploy-"));
		const path = join(dir, ".env.prod");
		writeFileSync(path, "SENTRY_RELEASE=abc\n");
		expect(() => assertRegularEnvFile(path)).not.toThrow();
	});
});

describe("readEnvAssignments", () => {
	it("rejects duplicate keys", () => {
		expect(() => readEnvAssignments("APP_SECRET=a\nAPP_SECRET=b\n")).toThrow(
			/duplicate/,
		);
	});
});

describe("live Function env names", () => {
	it("parseLiveFunctionEnvNames reads active_deployment.environment", () => {
		expect(
			parseLiveFunctionEnvNames({
				active_deployment: {
					environment: ["SENTRY_DSN", "APP_SECRET"],
				},
			}),
		).toEqual(["SENTRY_DSN", "APP_SECRET"]);
	});

	it("live-only names are the keys an apply would drop", () => {
		const uploadKeys = declaredUploadKeys();
		expect(
			liveOnlyEnvNames({
				liveNames: [...uploadKeys, "STALE_KEY"],
				uploadKeys,
			}),
		).toEqual(["STALE_KEY"]);
		expect(() => assertNoLiveOnlyEnv(["STALE_KEY"])).toThrow(/STALE_KEY/);
		expect(() => assertNoLiveOnlyEnv([])).not.toThrow();
	});
});
