import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function keyFromSecret(appSecret: string): Buffer {
	return createHash("sha256").update(appSecret).digest();
}

export function encryptSecret(plain: string, appSecret: string): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGO, keyFromSecret(appSecret), iv);
	const encrypted = Buffer.concat([
		cipher.update(plain, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string, appSecret: string): string {
	const buf = Buffer.from(payload, "base64");
	if (buf.length < IV_LENGTH + TAG_LENGTH) {
		throw new Error("ciphertext too short");
	}
	const iv = buf.subarray(0, IV_LENGTH);
	const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
	const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
	const decipher = createDecipheriv(ALGO, keyFromSecret(appSecret), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
		"utf8",
	);
}
