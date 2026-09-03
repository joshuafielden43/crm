import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { ModelCatalogService } from "../src/settings/model-catalog.service";

const originalEnv = { ...process.env };

afterEach(() => {
	process.env = { ...originalEnv };
});

describe("Hermes model catalog", () => {
	it.each([
		"https://user:secret@example.com/v1",
		"https://example.com/v1?key=secret",
		"https://example.com/v1#fragment",
		"file:///tmp/hermes",
		"not-a-url",
	])("disables the catalog for an invalid endpoint: %s", async (endpoint) => {
		process.env.HERMES_BASE_URL = endpoint;
		process.env.HERMES_API_KEY = "synthetic-key";
		process.env.HERMES_MODEL_ID = "synthetic-hermes";
		process.env.HERMES_CONTEXT_WINDOW = "32768";
		expect(await new ModelCatalogService().models()).toBeNull();
	});

	it("offers only the configured Hermes model without fetching a catalog", async () => {
		process.env.HERMES_BASE_URL = "http://127.0.0.1:8642/v1";
		process.env.HERMES_API_KEY = "synthetic-key";
		process.env.HERMES_MODEL_ID = "synthetic-hermes";
		process.env.HERMES_CONTEXT_WINDOW = "32768";
		const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("Unexpected request"),
		);
		try {
			const catalog = new ModelCatalogService();
			expect(await catalog.models()).toEqual([
				{
					id: "synthetic-hermes",
					name: "synthetic-hermes",
					provider: "Hermes",
					contextWindowTokens: 32768,
					pricing: null,
				},
			]);
			expect(await catalog.find("anthropic/claude-sonnet-5")).toBeNull();
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			fetch.mockRestore();
		}
	});

	it("makes no outbound request when Hermes is not configured", async () => {
		delete process.env.HERMES_BASE_URL;
		delete process.env.HERMES_API_KEY;
		delete process.env.HERMES_MODEL_ID;
		delete process.env.HERMES_CONTEXT_WINDOW;
		const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("Unexpected outbound request"),
		);
		try {
			const catalog = new ModelCatalogService();
			expect(await catalog.models()).toBeNull();
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			fetch.mockRestore();
		}
	});
});
