import { Analytics as SegmentAnalytics } from "@segment/analytics-node";

const TRACK_HOST = "https://track.neon.tech";
const ANONYMOUS = "anonymous";

export type Analytics = {
	track: (
		event: string,
		properties?: Record<string, string | number | boolean>,
	) => void;
	flush: () => Promise<void>;
};

const silentAnalytics: Analytics = {
	track: () => {},
	flush: async () => {},
};

function resolvedWriteKey(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

export const createAnalytics = (writeKey: string | undefined): Analytics => {
	const resolved = resolvedWriteKey(writeKey);
	if (resolved === undefined) {
		return silentAnalytics;
	}

	const client = new SegmentAnalytics({
		writeKey: resolved,
		host: TRACK_HOST,
		flushAt: 1,
	});

	return {
		track: (event, properties) => {
			try {
				client.track({
					userId: ANONYMOUS,
					event,
					properties,
				});
			} catch (error: unknown) {
				console.error("origin-neon analytics track failed:", error);
			}
		},
		flush: async () => {
			try {
				await client.flush();
			} catch (error: unknown) {
				console.error("origin-neon analytics flush failed:", error);
			}
		},
	};
};

export const analytics = createAnalytics(process.env.ANALYTICS_WRITE_KEY);
