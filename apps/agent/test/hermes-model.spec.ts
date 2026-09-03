import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { z } from "zod";
import { hermesModel } from "../agent/lib/hermes-model";

const originalEnv = { ...process.env };
const prompt = [
	{
		role: "user" as const,
		content: [{ type: "text" as const, text: "Synthetic routing check" }],
	},
];

afterEach(() => {
	process.env = { ...originalEnv };
});

describe("Hermes request boundary", () => {
	it("streams a tool call through the configured Hermes endpoint", async () => {
		const requests: string[] = [];
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: async (request) => {
				requests.push(await request.text());
				const chunks = [
					{
						id: "synthetic-stream",
						object: "chat.completion.chunk",
						created: 1,
						model: "synthetic-hermes",
						choices: [
							{
								index: 0,
								delta: {
									role: "assistant",
									tool_calls: [
										{
											index: 0,
											id: "call_fixture",
											type: "function",
											function: { name: "read_record", arguments: "{}" },
										},
									],
								},
								finish_reason: null,
							},
						],
					},
					{
						id: "synthetic-stream",
						object: "chat.completion.chunk",
						created: 1,
						model: "synthetic-hermes",
						choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
						usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
					},
				];
				return new Response(
					`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
					{ headers: { "content-type": "text/event-stream" } },
				);
			},
		});
		process.env.HERMES_BASE_URL = `${server.url.origin}/v1`;
		process.env.HERMES_API_KEY = "synthetic-key";
		process.env.HERMES_MODEL_ID = "synthetic-hermes";
		process.env.HERMES_CONTEXT_WINDOW = "32768";
		try {
			const result = await hermesModel().doStream({
				prompt,
				tools: [
					{
						type: "function",
						name: "read_record",
						inputSchema: { type: "object", properties: {} },
					},
				],
			});
			const chunks = await Array.fromAsync(result.stream);
			expect(chunks).toContainEqual(
				expect.objectContaining({
					type: "tool-call",
					toolCallId: "call_fixture",
					toolName: "read_record",
					input: "{}",
				}),
			);
			expect(requests).toHaveLength(1);
			expect(
				z
					.object({
						stream: z.literal(true),
						model: z.literal("synthetic-hermes"),
					})
					.parse(JSON.parse(requests[0] ?? "null")),
			).toEqual({ stream: true, model: "synthetic-hermes" });
		} finally {
			server.stop(true);
		}
	});

	it("refuses an old vendor model choice without making a request", async () => {
		process.env.HERMES_BASE_URL = "http://127.0.0.1:8642/v1";
		process.env.HERMES_API_KEY = "synthetic-key";
		process.env.HERMES_MODEL_ID = "synthetic-hermes";
		process.env.HERMES_CONTEXT_WINDOW = "32768";
		const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("Unexpected request"),
		);
		try {
			await expect(
				hermesModel("anthropic/claude-sonnet-5").doGenerate({ prompt }),
			).rejects.toThrow("not approved");
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			fetch.mockRestore();
		}
	});

	it("does not follow a redirect or send a prompt to the redirected destination", async () => {
		let destinationRequests = 0;
		const destination = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: () => {
				destinationRequests++;
				return new Response("Unexpected destination");
			},
		});
		const origin = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: () =>
				new Response(null, {
					status: 307,
					headers: { location: destination.url.href },
				}),
		});
		process.env.HERMES_BASE_URL = `${origin.url.origin}/v1`;
		process.env.HERMES_API_KEY = "synthetic-key";
		process.env.HERMES_MODEL_ID = "synthetic-hermes";
		process.env.HERMES_CONTEXT_WINDOW = "32768";
		try {
			await expect(hermesModel().doGenerate({ prompt })).rejects.toThrow();
			expect(destinationRequests).toBe(0);
		} finally {
			origin.stop(true);
			destination.stop(true);
		}
	});

	it("sends the configured model and synthetic prompt only to Hermes", async () => {
		const requests: {
			path: string;
			authorization: string | null;
			body: string;
		}[] = [];
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: async (request) => {
				requests.push({
					path: new URL(request.url).pathname,
					authorization: request.headers.get("authorization"),
					body: await request.text(),
				});
				return Response.json({
					id: "synthetic-response",
					object: "chat.completion",
					created: 1,
					model: "synthetic-hermes",
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "Hermes fixture reply" },
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
				});
			},
		});
		process.env.HERMES_BASE_URL = `${server.url.origin}/v1`;
		process.env.HERMES_API_KEY = "synthetic-hermes-key";
		process.env.HERMES_MODEL_ID = "synthetic-hermes";
		process.env.HERMES_CONTEXT_WINDOW = "32768";
		try {
			const result = await hermesModel().doGenerate({ prompt });
			expect(result.content).toContainEqual({
				type: "text",
				text: "Hermes fixture reply",
			});
			expect(requests).toHaveLength(1);
			expect(requests[0]?.path).toBe("/v1/chat/completions");
			expect(requests[0]?.authorization).toBe("Bearer synthetic-hermes-key");
			const body = z
				.object({
					model: z.string(),
					messages: z.array(
						z.object({ role: z.string(), content: z.string() }),
					),
				})
				.parse(JSON.parse(requests[0]?.body ?? "null"));
			expect(body).toEqual({
				model: "synthetic-hermes",
				messages: [{ role: "user", content: "Synthetic routing check" }],
			});
		} finally {
			server.stop(true);
		}
	});

	it("refuses generation and streaming without configuration, even with vendor credentials", async () => {
		delete process.env.HERMES_BASE_URL;
		process.env.OPENAI_API_KEY = "synthetic-vendor-key";
		process.env.AI_GATEWAY_API_KEY = "synthetic-gateway-key";
		const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("Unexpected request"),
		);
		try {
			await expect(hermesModel().doGenerate({ prompt })).rejects.toThrow(
				"Hermes",
			);
			await expect(hermesModel().doStream({ prompt })).rejects.toThrow(
				"Hermes",
			);
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			fetch.mockRestore();
		}
	});
});
