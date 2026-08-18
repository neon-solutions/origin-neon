import { describe, expect, it } from "vitest";
import { callbackUrlForTokenExchange } from "./oauth.ts";

const registered =
	"https://br-example-originneon.compute.c-4.us-east-2.aws.neon.tech/oauth/neon/callback";

describe("callbackUrlForTokenExchange", () => {
	it("copies the callback query onto the registered HTTPS redirect_uri", () => {
		const incoming = new URL(
			"http://127.0.0.1:8080/oauth/neon/callback?code=abc&state=s&scope=openid",
		);
		const grant = callbackUrlForTokenExchange(registered, incoming);
		expect(grant.origin).toBe(
			"https://br-example-originneon.compute.c-4.us-east-2.aws.neon.tech",
		);
		expect(grant.pathname).toBe("/oauth/neon/callback");
		expect(grant.searchParams.get("code")).toBe("abc");
		expect(grant.searchParams.get("state")).toBe("s");
		expect(grant.searchParams.get("scope")).toBe("openid");
	});

	it("keeps the registered origin when the incoming URL is already public HTTPS", () => {
		const incoming = new URL(`${registered}?code=abc&state=s`);
		const grant = callbackUrlForTokenExchange(registered, incoming);
		expect(grant.href).toBe(`${registered}?code=abc&state=s`);
	});

	it("ignores an internal pathname and uses the registered callback path", () => {
		const incoming = new URL("http://10.0.0.1/fn?code=abc&state=s");
		const grant = callbackUrlForTokenExchange(registered, incoming);
		expect(grant.pathname).toBe("/oauth/neon/callback");
		expect(grant.searchParams.get("code")).toBe("abc");
	});
});
