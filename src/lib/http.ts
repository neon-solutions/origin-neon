export function json(status: number, body: Record<string, unknown>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

export function text(status: number, body: string): Response {
	return new Response(body, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}

export function html(status: number, body: string): Response {
	return new Response(body, {
		status,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

// LKB-16631: a 3xx Location is consumed inside the Functions path and the
// client receives the target's status and body instead.
export function redirect(location: string): Response {
	if (/[\r\n]/.test(location)) {
		throw new Error("redirect location contains a newline");
	}
	const href = escapeHtml(location);
	const body = `<!doctype html><meta charset="utf-8"><title>Continue</title><p><a href="${href}">Continue</a></p><script>location.replace(${JSON.stringify(location)})</script>`;
	return new Response(body, {
		status: 200,
		headers: {
			"content-type": "text/html; charset=utf-8",
			refresh: `0; url=${location}`,
		},
	});
}
