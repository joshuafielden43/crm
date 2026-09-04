import { afterEach, expect, test } from "bun:test";
import { searchLab } from "../agent/lib/lab-search";

const saved = process.env.SEARXNG_URL;
afterEach(() => {
	if (saved === undefined) delete process.env.SEARXNG_URL;
	else process.env.SEARXNG_URL = saved;
});

test("missing configuration makes no request", async () => {
	delete process.env.SEARXNG_URL;
	expect((await searchLab("test")).ok).toBe(false);
});

test("returns bounded source snippets from the configured endpoint", async () => {
	const requests: string[] = [];
	const server = Bun.serve({
		port: 0,
		fetch(request) {
			requests.push(request.url);
			return Response.json({
				results: Array.from({ length: 9 }, (_, i) => ({
					title: `Source ${i}`,
					url: `https://example.com/${i}`,
					content: "x".repeat(3000),
				})),
			});
		},
	});
	try {
		process.env.SEARXNG_URL = server.url.origin;
		const result = await searchLab("public company & news");
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.reason);
		expect(result.results).toHaveLength(5);
		expect(result.results[0]?.snippet).toHaveLength(2000);
		expect(
			new URL(requests[0] ?? "http://missing.invalid").searchParams.get("q"),
		).toBe("public company & news");
		expect(new URL(requests[0] ?? "http://missing.invalid").pathname).toBe(
			"/search",
		);
	} finally {
		server.stop(true);
	}
});

test("does not send a search query to a redirect destination", async () => {
	let leaked = false;
	const destination = Bun.serve({
		port: 0,
		fetch() {
			leaked = true;
			return Response.json({ results: [] });
		},
	});
	const redirect = Bun.serve({
		port: 0,
		fetch() {
			return Response.redirect(destination.url);
		},
	});
	try {
		process.env.SEARXNG_URL = redirect.url.origin;
		expect((await searchLab("private query")).ok).toBe(false);
		expect(leaked).toBe(false);
	} finally {
		redirect.stop(true);
		destination.stop(true);
	}
});

test("rejects malformed results and propagates cancellation", async () => {
	const server = Bun.serve({
		port: 0,
		fetch() {
			return Response.json({ results: [{ url: "file:///etc/passwd" }] });
		},
	});
	try {
		process.env.SEARXNG_URL = server.url.origin;
		expect((await searchLab("test")).ok).toBe(false);
		expect((await searchLab("test", AbortSignal.abort())).ok).toBe(false);
	} finally {
		server.stop(true);
	}
});
