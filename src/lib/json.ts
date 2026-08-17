export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(
	obj: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = obj[key];
	return typeof value === "string" ? value : undefined;
}

export function readRecord(
	obj: Record<string, unknown>,
	key: string,
): Record<string, unknown> | undefined {
	const value = obj[key];
	return isRecord(value) ? value : undefined;
}
