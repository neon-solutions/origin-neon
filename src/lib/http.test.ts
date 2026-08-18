import { describe, expect, it } from "vitest";
import { redirect } from "./http.ts";

const target =
	"https://oauth2.neon.tech/oauth2/auth?client_id=origin-neon&redirect_uri=https://example.com/oauth/neon/callback&state=abc";

describe("redirect", () => {
	it("sends a 200 Refresh interstitial instead of a 3xx Location", () => {
		const response = redirect(target);
		expect(response.status).toBe(200);
		expect(response.headers.get("location")).toBeNull();
		expect(response.headers.get("refresh")).toBe(`0; url=${target}`);
		expect(response.headers.get("content-type")).toBe(
			"text/html; charset=utf-8",
		);
	});

	it("puts the URL in the anchor and in location.replace", async () => {
		const response = redirect(target);
		const body = await response.text();
		expect(body).toContain(
			'href="https://oauth2.neon.tech/oauth2/auth?client_id=origin-neon&amp;redirect_uri=https://example.com/oauth/neon/callback&amp;state=abc"',
		);
		expect(body).toContain(`location.replace(${JSON.stringify(target)})`);
	});

	it("rejects a location that would split the Refresh header", () => {
		expect(() => redirect("https://example.com/\r\nX-Injected: 1")).toThrow(
			/newline/,
		);
	});
});
