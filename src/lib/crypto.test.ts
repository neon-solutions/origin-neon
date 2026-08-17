import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto.ts";

describe("encryptSecret", () => {
	it("round-trips a refresh token", () => {
		const secret = "a-very-long-app-secret";
		const plain = "neon-refresh-token";
		const cipher = encryptSecret(plain, secret);
		expect(cipher).not.toBe(plain);
		expect(decryptSecret(cipher, secret)).toBe(plain);
	});

	it("fails with the wrong app secret", () => {
		const cipher = encryptSecret("token", "a-very-long-app-secret");
		expect(() => decryptSecret(cipher, "a-different-app-secret")).toThrow();
	});
});
