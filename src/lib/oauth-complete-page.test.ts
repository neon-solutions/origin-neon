import { describe, expect, it } from "vitest";
import { OAUTH_COMPLETE_PAGE } from "./oauth-complete-page.ts";

describe("OAUTH_COMPLETE_PAGE", () => {
	it("uses the Neon CLI post-sign-in copy and logomark", () => {
		expect(OAUTH_COMPLETE_PAGE).toContain("<title>Neon</title>");
		expect(OAUTH_COMPLETE_PAGE).toContain("<h1>Thank you for using Neon</h1>");
		expect(OAUTH_COMPLETE_PAGE).toContain("<p>You may close this page now</p>");
		expect(OAUTH_COMPLETE_PAGE).toContain(
			"font-family: 'Open Sans', sans-serif",
		);
		expect(OAUTH_COMPLETE_PAGE).toContain("background-color: #ffffff");
		expect(OAUTH_COMPLETE_PAGE).toContain("color: #2d374c");
		expect(OAUTH_COMPLETE_PAGE).toContain("background-color: #191919");
		expect(OAUTH_COMPLETE_PAGE).toContain("color: #bfbfbf");
		expect(OAUTH_COMPLETE_PAGE).toContain("fill: #37c38f");
		expect(OAUTH_COMPLETE_PAGE).toContain("fill: #34d59a");
		expect(OAUTH_COMPLETE_PAGE).toContain(
			'd="M63 0.0177909V63.5526L38.4178 42.2501V63.5526H0V0L63 0.0177909ZM7.72251 55.8389H30.6953V25.3238L55.2779 47.0476V7.72922L7.72251 7.71559V55.8389Z"',
		);
		expect(OAUTH_COMPLETE_PAGE).not.toContain("OAuth completed");
	});
});
