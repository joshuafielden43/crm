import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import type { DynamicResolveContext } from "eve";
import root from "../agent/agent";
import builder from "../agent/subagents/agent_builder/agent";
import runner from "../agent/subagents/agent_runner/agent";

describe("all CRM agent model fallbacks", () => {
	it("blocks every model resolver when database reads fail", async () => {
		const context: DynamicResolveContext = {
			session: {
				id: "synthetic-session",
				auth: {
					initiator: null,
					current: {
						authenticator: "fixture",
						principalId: "fixture",
						principalType: "service",
						attributes: { purpose: "team-agent", runId: "synthetic-run" },
					},
				},
			},
			channel: {},
			messages: [],
		};
		const output = execFileSync(
			process.execPath,
			[
				"--eval",
				`
import assert from "node:assert/strict";
import root from "./agent/agent";
import builder from "./agent/subagents/agent_builder/agent";
import runner from "./agent/subagents/agent_runner/agent";
let requests = 0;
globalThis.fetch = async () => { requests++; throw new Error("Unexpected model request"); };
const context = ${JSON.stringify(context)};
for (const agent of [root, builder, runner]) {
  const selection = await agent.model.events["step.started"](undefined, context);
  await assert.rejects(() => selection.model.doGenerate({ prompt: [] }), /unavailable/);
}
assert.equal(requests, 0);
console.log("database-failure-blocked");
`,
			],
			{
				cwd: new URL("..", import.meta.url).pathname,
				env: {
					...process.env,
					NODE_ENV: "test",
					DATABASE_URL: "postgresql://postgres@127.0.0.1:1/unavailable_test",
					TEST_DATABASE_URL:
						"postgresql://postgres@127.0.0.1:1/unavailable_test",
					HERMES_BASE_URL: "http://127.0.0.1:8642/v1",
					HERMES_API_KEY: "synthetic-key",
					HERMES_MODEL_ID: "synthetic-hermes",
					HERMES_CONTEXT_WINDOW: "32768",
				},
				timeout: 15000,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		expect(output).toContain("database-failure-blocked");
	});

	it("returns a blocked runner selection for missing run context", async () => {
		const context: DynamicResolveContext = {
			session: {
				id: "synthetic-session",
				auth: { current: null, initiator: null },
			},
			channel: {},
			messages: [],
		};
		const selection = await runner.model.events["step.started"](
			undefined,
			context,
		);
		await expect(selection.model.doGenerate({ prompt: [] })).rejects.toThrow(
			"unavailable",
		);
	});

	for (const [name, agent] of Object.entries({ root, builder, runner })) {
		it(`${name} fails closed instead of selecting a vendor model`, async () => {
			expect(agent.model.fallback).toMatchObject({
				provider: "hermes.chat",
				modelId: "hermes-unconfigured",
			});
			await expect(
				agent.model.fallback.doGenerate({ prompt: [] }),
			).rejects.toThrow("Hermes");
			await expect(
				agent.model.fallback.doStream({ prompt: [] }),
			).rejects.toThrow("Hermes");
		});
	}
});
