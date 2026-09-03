import { expect, it } from "bun:test";
import { execFileSync } from "node:child_process";

it("Eve overrides durable vendor selections with blocked Hermes selections on every step", () => {
	const output = execFileSync(
		process.execPath,
		[
			"--eval",
			`
import assert from "node:assert/strict";
import root from "./agent/agent";
import builder from "./agent/subagents/agent_builder/agent";
import runner from "./agent/subagents/agent_runner/agent";
const base = new URL("./", import.meta.resolve("eve"));
const { ContextContainer } = await import(new URL("context/container.js", base).href);
const keys = await import(new URL("context/keys.js", base).href);
const { dispatchDynamicModelEvent, getActiveDynamicModelSelection } = await import(new URL("context/dynamic-model-lifecycle.js", base).href);
let requests = 0;
globalThis.fetch = async () => { requests++; throw new Error("Unexpected outbound request"); };
for (const agent of [root, builder, runner]) {
  const ctx = new ContextContainer();
  ctx.set(keys.SessionDynamicModelReferenceKey, { id: "anthropic/claude-sonnet-5", contextWindowTokens: 200000 });
  ctx.set(keys.TurnDynamicModelReferenceKey, { id: "openai/gpt-5", contextWindowTokens: 200000 });
  for (let stepIndex = 0; stepIndex < 2; stepIndex++) {
    ctx.clearVirtualContext();
    assert.equal(getActiveDynamicModelSelection(ctx).reference.id, "openai/gpt-5");
    await dispatchDynamicModelEvent({
      ctx,
      dynamicModel: { sourceKind: "module", sourceId: "fixture", logicalPath: "agent.ts", eventNames: ["step.started"] },
      event: { type: "step.started", sequence: stepIndex + 1, stepIndex, turnId: "fixture-turn" },
      fallback: { id: "hermes/hermes-unconfigured", contextWindowTokens: 32768 },
      messages: [],
      scope: { nodeId: "fixture-node", moduleMap: { nodes: { "fixture-node": { modules: { fixture: { default: agent } } } } } },
    });
    const selection = getActiveDynamicModelSelection(ctx);
    assert.equal(selection.model.provider, "hermes.chat");
    await assert.rejects(() => selection.model.doGenerate({ prompt: [] }), /Hermes/);
    await assert.rejects(() => selection.model.doStream({ prompt: [] }), /Hermes/);
  }
}
assert.equal(requests, 0);
console.log("durable-vendor-selections-blocked");
`,
		],
		{
			cwd: new URL("..", import.meta.url).pathname,
			env: {
				...process.env,
				NODE_ENV: "production",
				EVE_MOCK_AUTHORED_MODELS: "0",
				DATABASE_URL: "postgresql://postgres@127.0.0.1:1/unavailable_test",
				TEST_DATABASE_URL: "postgresql://postgres@127.0.0.1:1/unavailable_test",
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
	expect(output).toContain("durable-vendor-selections-blocked");
});
