import {
	createHash,
	createPublicKey,
	verify,
	type JsonWebKey,
} from "node:crypto";
import { isRecord } from "./json.ts";

export const ORIGIN_JWKS_URL = "https://api.cursor.com/v1/origin/keys";
export const WEBHOOK_MAX_SKEW_SECONDS = 300;

export type WebhookHeaders = {
	id: string;
	timestamp: number;
	signature: string;
};

export function readWebhookHeaders(
	headers: Headers,
): WebhookHeaders | { error: string } {
	const id = headers.get("webhook-id");
	const timestampRaw = headers.get("webhook-timestamp");
	const signatureHeader = headers.get("webhook-signature");
	if (id === null || timestampRaw === null || signatureHeader === null) {
		return {
			error: "missing webhook-id, webhook-timestamp, or webhook-signature",
		};
	}
	const timestamp = Number(timestampRaw);
	if (!Number.isInteger(timestamp)) {
		return { error: "webhook-timestamp is not an integer" };
	}
	const signature = signatureHeader
		.split(/\s+/)
		.find((value) => value.startsWith("v1ed,"));
	if (signature === undefined) {
		return { error: "webhook-signature has no v1ed signature" };
	}
	return { id, timestamp, signature };
}

export function webhookDigest(input: {
	id: string;
	timestamp: number;
	body: Buffer;
}): string {
	return createHash("sha256")
		.update(`${input.id}.${input.timestamp}.`)
		.update(input.body)
		.digest("hex");
}

export function verifyWebhookSignature(input: {
	body: Buffer;
	headers: WebhookHeaders;
	keys: JsonWebKey[];
	nowSeconds?: number;
}): { ok: true } | { ok: false; error: string } {
	const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
	if (Math.abs(now - input.headers.timestamp) > WEBHOOK_MAX_SKEW_SECONDS) {
		return { ok: false, error: "webhook timestamp is older than 5 minutes" };
	}
	const digest = webhookDigest({
		id: input.headers.id,
		timestamp: input.headers.timestamp,
		body: input.body,
	});
	const signature = Buffer.from(input.headers.signature.slice(5), "base64");
	const matched = input.keys.some((jwk) => {
		try {
			return verify(
				null,
				Buffer.from(digest),
				createPublicKey({ key: jwk, format: "jwk" }),
				signature,
			);
		} catch {
			return false;
		}
	});
	if (!matched) {
		return { ok: false, error: "webhook signature did not match any JWKS key" };
	}
	return { ok: true };
}

export type OriginJwk = JsonWebKey & { kid?: string };

export async function fetchOriginJwks(
	fetchImpl: typeof fetch = fetch,
): Promise<OriginJwk[]> {
	const response = await fetchImpl(ORIGIN_JWKS_URL);
	if (!response.ok) {
		throw new Error(`Origin JWKS returned ${response.status}`);
	}
	const body: unknown = await response.json();
	if (!isRecord(body) || !Array.isArray(body.keys)) {
		throw new Error("Origin JWKS response is missing keys");
	}
	const keys: OriginJwk[] = [];
	for (const item of body.keys) {
		if (!isRecord(item)) {
			continue;
		}
		if (item.kty !== "OKP" || item.crv !== "Ed25519") {
			continue;
		}
		if (typeof item.x !== "string") {
			continue;
		}
		const key: OriginJwk = {
			kty: "OKP",
			crv: "Ed25519",
			x: item.x,
			alg: "EdDSA",
		};
		if (typeof item.kid === "string") {
			key.kid = item.kid;
		}
		keys.push(key);
	}
	if (keys.length === 0) {
		throw new Error("Origin JWKS returned no Ed25519 keys");
	}
	return keys;
}
