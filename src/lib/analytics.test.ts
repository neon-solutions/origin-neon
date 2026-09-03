import { describe, expect, it } from "vitest";
import { createAnalytics } from "./analytics.ts";

describe("analytics", () => {
	it("is a no-op when no write key is configured", async () => {
		const client = createAnalytics(undefined);
		expect(() =>
			client.track("origin_webhook_processed", { source: "origin_webhook" }),
		).not.toThrow();
		await expect(client.flush()).resolves.toBeUndefined();
	});

	it("treats a blank write key as unset", async () => {
		const client = createAnalytics("   ");
		expect(() =>
			client.track("origin_webhook_processed", { source: "origin_webhook" }),
		).not.toThrow();
		await expect(client.flush()).resolves.toBeUndefined();
	});
});
