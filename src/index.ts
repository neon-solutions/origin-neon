import "./instrument.ts";
import { Sentry } from "./instrument.ts";
import { loadConfig } from "./lib/config.ts";
import { connectDb, migrate, type Sql } from "./lib/db.ts";
import { handleOauthCallback, handleOauthStart } from "./lib/handle-oauth.ts";
import {
	handleOriginCallback,
	handleOriginInstall,
} from "./lib/handle-origin.ts";
import { handleWebhook } from "./lib/handle-webhook.ts";
import { json } from "./lib/http.ts";

let sql: Sql | undefined;
let migrated = false;

async function db(databaseUrl: string): Promise<Sql> {
	if (sql === undefined) {
		sql = connectDb(databaseUrl);
	}
	if (!migrated) {
		await migrate(sql);
		migrated = true;
	}
	return sql;
}

async function route(request: Request): Promise<Response> {
	const url = new URL(request.url);
	if (
		request.method === "GET" &&
		(url.pathname === "/" || url.pathname === "/health")
	) {
		return json(200, { ok: true, service: "origin-neon" });
	}

	const config = loadConfig();
	const database = await db(config.databaseUrl);

	if (request.method === "GET" && url.pathname === "/origin/install") {
		return handleOriginInstall({ config, sql: database, url });
	}
	if (request.method === "GET" && url.pathname === "/origin/callback") {
		return handleOriginCallback({ config, sql: database, url });
	}
	if (request.method === "GET" && url.pathname === "/oauth/neon/start") {
		return handleOauthStart({ config, sql: database, url });
	}
	if (request.method === "GET" && url.pathname === "/oauth/neon/callback") {
		return handleOauthCallback({ config, sql: database, url });
	}
	if (request.method === "POST" && url.pathname === "/origin/webhook") {
		return handleWebhook({ config, sql: database, request });
	}

	return json(404, { error: "not found" });
}

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		return Sentry.withIsolationScope(() =>
			Sentry.startSpan(
				{
					op: "http.server",
					name: `${request.method} ${url.pathname}`,
					forceTransaction: true,
					attributes: {
						"http.request.method": request.method,
						"url.path": url.pathname,
					},
				},
				async (span) => {
					try {
						const response = await route(request);
						span.setAttribute("http.response.status_code", response.status);
						return response;
					} catch (error) {
						Sentry.captureException(error);
						span.setAttribute("http.response.status_code", 500);
						const message =
							error instanceof Error ? error.message : String(error);
						return json(500, { error: message });
					}
				},
			).finally(() => Sentry.flush(2000)),
		);
	},
};
