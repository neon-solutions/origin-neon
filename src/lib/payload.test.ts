import { describe, expect, it } from "vitest";
import { parseDelivery, parsePullEvent } from "./payload.ts";

describe("parseDelivery", () => {
	it("reads the envelope Origin documents", () => {
		expect(
			parseDelivery({
				deliveryId: "whd_1",
				appId: "app_1",
				installationId: "i_1",
				event: {
					id: "evt_1",
					type: "pull_request.created",
					payload: { ok: true },
				},
			}),
		).toEqual({
			deliveryId: "whd_1",
			appId: "app_1",
			installationId: "i_1",
			event: {
				id: "evt_1",
				type: "pull_request.created",
				payload: { ok: true },
			},
		});
	});

	it("rejects a body that is not an object", () => {
		expect(() => parseDelivery([])).toThrow(/not an object/);
	});
});

describe("parsePullEvent", () => {
	it("reads number, head, base, and repository", () => {
		expect(
			parsePullEvent({
				pullRequest: {
					number: "7",
					head: { ref: "feat", sha: "abc" },
					base: { ref: "main", sha: "def" },
				},
				repository: {
					id: "repo_1",
					name: "demo",
					owner: { slug: "acme", id: "own_1" },
				},
			}),
		).toEqual({
			pull: {
				number: "7",
				headRef: "feat",
				headSha: "abc",
				baseRef: "main",
			},
			repository: { id: "repo_1", name: "demo", ownerSlug: "acme" },
		});
	});
});
