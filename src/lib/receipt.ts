import { createPublicKey, type JsonWebKey } from "node:crypto";
import { jwtVerify } from "jose";
import { isRecord, readString } from "./json.ts";
import type { OriginJwk } from "./webhook.ts";

export const ORIGIN_ISSUER = "https://api.cursor.com/v1/origin";
export const RECEIPT_TYP = "origin-installation-receipt+jwt";

export type InstallationReceipt = {
	installationId: string;
	namespaceId: string | undefined;
	jti: string;
	state: string | undefined;
};

function keyForKid(keys: OriginJwk[], kid: string): JsonWebKey | undefined {
	return keys.find((key) => key.kid === kid);
}

export async function verifyInstallationReceipt(input: {
	token: string;
	appId: string;
	keys: OriginJwk[];
	expectedState?: string;
}): Promise<InstallationReceipt> {
	const [headerPart] = input.token.split(".");
	if (headerPart === undefined) {
		throw new Error("installation receipt is not a JWT");
	}
	const headerJson = Buffer.from(headerPart, "base64url").toString("utf8");
	const header: unknown = JSON.parse(headerJson);
	if (!isRecord(header)) {
		throw new Error("installation receipt header is not an object");
	}
	if (header.alg !== "EdDSA") {
		throw new Error("installation receipt alg must be EdDSA");
	}
	if (header.typ !== RECEIPT_TYP) {
		throw new Error(`installation receipt typ must be ${RECEIPT_TYP}`);
	}
	const kid = readString(header, "kid");
	if (kid === undefined) {
		throw new Error("installation receipt is missing kid");
	}
	const jwk = keyForKid(input.keys, kid);
	if (jwk === undefined) {
		throw new Error(`installation receipt kid ${kid} is not in JWKS`);
	}

	const { payload } = await jwtVerify(
		input.token,
		createPublicKey({ key: jwk, format: "jwk" }),
		{
			algorithms: ["EdDSA"],
			issuer: ORIGIN_ISSUER,
			audience: input.appId,
		},
	);

	if (typeof payload.sub !== "string" || payload.sub.length === 0) {
		throw new Error("installation receipt is missing sub");
	}
	if (typeof payload.jti !== "string" || payload.jti.length === 0) {
		throw new Error("installation receipt is missing jti");
	}
	const state = typeof payload.state === "string" ? payload.state : undefined;
	if (input.expectedState !== undefined && state !== input.expectedState) {
		throw new Error("installation receipt state does not match");
	}

	return {
		installationId: payload.sub,
		namespaceId:
			typeof payload.namespace_id === "string"
				? payload.namespace_id
				: undefined,
		jti: payload.jti,
		state,
	};
}
