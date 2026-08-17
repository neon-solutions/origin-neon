import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	fetchOriginJwks,
	verifyWebhookSignature,
	webhookDigest,
	WEBHOOK_MAX_SKEW_SECONDS,
} from "./webhook.ts";

function testKey() {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	const jwk = publicKey.export({ format: "jwk" });
	return { privateKey, jwk };
}

function signBody(input: {
	id: string;
	timestamp: number;
	body: Buffer;
	privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
}): string {
	const digest = webhookDigest(input);
	const signature = sign(null, Buffer.from(digest), input.privateKey);
	return `v1ed,${signature.toString("base64")}`;
}

describe("verifyWebhookSignature", () => {
	it("accepts a body signed by an active Ed25519 key", () => {
		const { privateKey, jwk } = testKey();
		const body = Buffer.from('{"deliveryId":"whd_1"}');
		const timestamp = Math.floor(Date.now() / 1000);
		const headers = {
			id: "whd_1",
			timestamp,
			signature: signBody({ id: "whd_1", timestamp, body, privateKey }),
		};
		expect(verifyWebhookSignature({ body, headers, keys: [jwk] })).toEqual({
			ok: true,
		});
	});

	it("rejects a mutated body", () => {
		const { privateKey, jwk } = testKey();
		const body = Buffer.from('{"deliveryId":"whd_1"}');
		const timestamp = Math.floor(Date.now() / 1000);
		const headers = {
			id: "whd_1",
			timestamp,
			signature: signBody({ id: "whd_1", timestamp, body, privateKey }),
		};
		const result = verifyWebhookSignature({
			body: Buffer.from('{"deliveryId":"whd_2"}'),
			headers,
			keys: [jwk],
		});
		expect(result.ok).toBe(false);
	});

	it("rejects a timestamp older than five minutes", () => {
		const { privateKey, jwk } = testKey();
		const body = Buffer.from("{}");
		const timestamp =
			Math.floor(Date.now() / 1000) - WEBHOOK_MAX_SKEW_SECONDS - 1;
		const headers = {
			id: "whd_old",
			timestamp,
			signature: signBody({ id: "whd_old", timestamp, body, privateKey }),
		};
		const result = verifyWebhookSignature({ body, headers, keys: [jwk] });
		expect(result.ok).toBe(false);
	});
});

describe("fetchOriginJwks", () => {
	it("returns live Ed25519 keys from Origin", async () => {
		const keys = await fetchOriginJwks();
		expect(keys.length).toBeGreaterThan(0);
		const first = keys[0];
		expect(first?.kty).toBe("OKP");
		expect(first?.crv).toBe("Ed25519");
	});
});
