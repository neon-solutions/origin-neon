import { generateKeyPairSync } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
	ORIGIN_ISSUER,
	RECEIPT_TYP,
	verifyInstallationReceipt,
} from "./receipt.ts";
import type { OriginJwk } from "./webhook.ts";

async function signedReceipt(input: {
	appId: string;
	installationId: string;
	state?: string;
	typ?: string;
	kid?: string;
}): Promise<{ token: string; keys: OriginJwk[] }> {
	const { privateKey, publicKey } = generateKeyPairSync("ed25519");
	const pem = privateKey.export({ format: "pem", type: "pkcs8" });
	if (typeof pem !== "string") {
		throw new Error("expected PKCS8 pem");
	}
	const jwk = publicKey.export({ format: "jwk" });
	const kid = input.kid ?? "origin-test-key";
	if (typeof jwk.x !== "string") {
		throw new Error("expected Ed25519 jwk.x");
	}
	const key: OriginJwk = {
		kty: "OKP",
		crv: "Ed25519",
		x: jwk.x,
		alg: "EdDSA",
		kid,
	};
	const signer = await importPKCS8(pem, "EdDSA");
	let jwt = new SignJWT({
		namespace_id: "ns_test",
		...(input.state === undefined ? {} : { state: input.state }),
	})
		.setProtectedHeader({
			alg: "EdDSA",
			kid,
			typ: input.typ ?? RECEIPT_TYP,
		})
		.setIssuer(ORIGIN_ISSUER)
		.setAudience(input.appId)
		.setSubject(input.installationId)
		.setJti("receipt-1")
		.setIssuedAt()
		.setExpirationTime("5m");
	return { token: await jwt.sign(signer), keys: [key] };
}

describe("verifyInstallationReceipt", () => {
	it("accepts a receipt signed by the matching JWKS key", async () => {
		const { token, keys } = await signedReceipt({
			appId: "app_01test",
			installationId: "i_01test",
			state: "abc",
		});
		const receipt = await verifyInstallationReceipt({
			token,
			appId: "app_01test",
			keys,
			expectedState: "abc",
		});
		expect(receipt.installationId).toBe("i_01test");
		expect(receipt.state).toBe("abc");
		expect(receipt.jti).toBe("receipt-1");
	});

	it("rejects the wrong typ", async () => {
		const { token, keys } = await signedReceipt({
			appId: "app_01test",
			installationId: "i_01test",
			typ: "JWT",
		});
		await expect(
			verifyInstallationReceipt({
				token,
				appId: "app_01test",
				keys,
			}),
		).rejects.toThrow(/typ/);
	});

	it("rejects a state mismatch", async () => {
		const { token, keys } = await signedReceipt({
			appId: "app_01test",
			installationId: "i_01test",
			state: "abc",
		});
		await expect(
			verifyInstallationReceipt({
				token,
				appId: "app_01test",
				keys,
				expectedState: "other",
			}),
		).rejects.toThrow(/state/);
	});
});
