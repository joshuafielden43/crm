import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import { db } from "@crm/db";
import { agentManifest } from "@crm/validation/agent-manifest";
import type { DynamicResolveContext } from "eve";
import runner from "../agent/subagents/agent_runner/agent";

const originalEnv = { ...process.env };
const userId = `hermes-runner-${crypto.randomUUID()}`;
let agentId = "";
let versionNumber = 0;

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Hermes fixture",
			email: `${userId}@example.test`,
		},
	});
	const agent = await db.agentDefinition.create({
		data: { name: "Hermes fixture", status: "LIVE", createdById: userId },
	});
	agentId = agent.id;
});

beforeEach(() => {
	process.env.HERMES_BASE_URL = "http://127.0.0.1:8642/v1";
	process.env.HERMES_API_KEY = "synthetic-key";
	process.env.HERMES_MODEL_ID = "synthetic-hermes";
	process.env.HERMES_CONTEXT_WINDOW = "32768";
});

afterEach(() => {
	process.env = { ...originalEnv };
});

afterAll(async () => {
	await db.agentRun.deleteMany({ where: { agentId } });
	await db.agentVersion.deleteMany({ where: { agentId } });
	await db.agentDefinition.deleteMany({ where: { id: agentId } });
	await db.user.deleteMany({ where: { id: userId } });
});

async function createRun(modelId: string) {
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: ++versionNumber,
			status: "DEPLOYED",
			instructions: "Synthetic routing check",
			modelId,
			modelContextWindowTokens: 999999,
			sandboxPolicy: {},
			createdById: userId,
			manifest: agentManifest.parse({
				triggers: [
					{
						type: "MANUAL",
						name: "Synthetic run",
						summary: "Run the synthetic fixture",
						config: {},
					},
				],
				dataScope: {
					mode: "WORKSPACE",
					summary: "Synthetic test",
					resources: [],
				},
				actions: [
					{
						type: "run.summary",
						provider: "crm",
						summary: "Synthetic summary",
					},
				],
			}),
		},
	});
	const run = await db.agentRun.create({
		data: {
			agentId,
			versionId: version.id,
			triggerType: "MANUAL",
			status: "RUNNING",
			idempotencyKey: crypto.randomUUID(),
			correlationId: crypto.randomUUID(),
		},
	});
	return run.id;
}

function context(runId: string): DynamicResolveContext {
	return {
		session: {
			id: "synthetic-session",
			auth: {
				initiator: null,
				current: {
					authenticator: "fixture",
					principalType: "service",
					principalId: userId,
					attributes: { purpose: "team-agent", runId },
				},
			},
		},
		channel: {},
		messages: [],
	};
}

describe("stored runner model selection", () => {
	it("selects Hermes and uses the deployment context window instead of stale version metadata", async () => {
		const runId = await createRun("synthetic-hermes");
		const selection = await runner.model.events["step.started"](
			undefined,
			context(runId),
		);
		expect(selection).toMatchObject({
			model: { provider: "hermes.chat", modelId: "synthetic-hermes" },
			modelContextWindowTokens: 32768,
		});
	});

	it("blocks a stored vendor model and an unknown run without any request", async () => {
		const runId = await createRun("anthropic/claude-sonnet-5");
		const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("Unexpected outbound request"),
		);
		try {
			for (const id of [runId, "nonexistent-hermes-run"]) {
				const selection = await runner.model.events["step.started"](
					undefined,
					context(id),
				);
				await expect(
					selection.model.doGenerate({ prompt: [] }),
				).rejects.toThrow("Hermes");
			}
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			fetch.mockRestore();
		}
	});
});
