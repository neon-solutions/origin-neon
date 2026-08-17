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

export function redirect(location: string): Response {
	return new Response(null, {
		status: 302,
		headers: { location },
	});
}
