import { expect, it } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { SANDBOX } from "../agent/lib/sandbox-config";

const testTimeoutMs = SANDBOX.startupTimeoutMs + 5000;

it("refuses every CRM sandbox when Docker is unavailable", () => {
	const output = execFileSync(
		process.execPath,
		[
			"--eval",
			`
import assert from "node:assert/strict";
import root from "./agent/sandbox/sandbox";
import builder from "./agent/subagents/agent_builder/sandbox/sandbox";
import runner from "./agent/subagents/agent_runner/sandbox/sandbox";
for (const definition of [root, builder, runner]) {
  assert.equal(definition.backend.name, "docker");
  await assert.rejects(() => definition.backend.create({
    templateKey: null,
    sessionKey: "docker-unavailable-verification",
    runtimeContext: { appRoot: process.cwd() },
  }), /docker/i);
}
console.log("all-sandboxes-fail-closed");
`,
		],
		{
			cwd: new URL("..", import.meta.url).pathname,
			env: {
				...process.env,
				VERCEL: "",
				EVE_DOCKER_PATH: "/nonexistent-crm-verification/docker",
			},
			encoding: "utf8",
			timeout: testTimeoutMs,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	expect(output).toContain("all-sandboxes-fail-closed");
});

it("refuses agent startup before serving when Docker is unavailable", () => {
	const result = spawnSync(process.execPath, ["scripts/start.ts"], {
		cwd: new URL("..", import.meta.url).pathname,
		env: {
			...process.env,
			EVE_DOCKER_PATH: "/nonexistent-crm-verification/docker",
		},
		encoding: "utf8",
		timeout: testTimeoutMs,
	});
	expect(result.error).toBeUndefined();
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("Docker sandbox unavailable");
});
