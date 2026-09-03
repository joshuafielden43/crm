import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, type Prisma } from "@crm/db";
import { readAgentModel, SETTINGS_ID, writeAgentModel } from "@crm/db/settings";
import { selectedModel } from "../agent/lib/model";

async function clear() {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
}

/**
 * The row holds the Context key a rep typed and the model they chose, and
 * DATABASE_URL is somebody's working database. Deleting it and not putting it
 * back sends them through the research-key gate again with nothing saying why.
 */
let saved: Prisma.AppSettingUncheckedCreateInput | null = null;
const originalEnv = { ...process.env };

beforeAll(async () => {
	saved = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
});

beforeEach(async () => {
	await clear();
	process.env.HERMES_BASE_URL = "http://127.0.0.1:8642/v1";
	process.env.HERMES_API_KEY = "synthetic-key";
	process.env.HERMES_MODEL_ID = "synthetic-hermes";
	process.env.HERMES_CONTEXT_WINDOW = "32768";
});
afterEach(async () => {
	await clear();
	process.env = { ...originalEnv };
});

afterAll(async () => {
	if (saved) await db.appSetting.create({ data: saved });
});

describe("the configured model", () => {
	it("uses the configured Hermes model when nothing has been chosen", async () => {
		const setting = await readAgentModel(db);

		expect(setting.id).toBe("synthetic-hermes");
		expect(setting.isDefault).toBe(true);

		expect((await selectedModel()).model.modelId).toBe("synthetic-hermes");
	});

	it("returns the chosen model with its own context window", async () => {
		await writeAgentModel(db, {
			id: "synthetic-hermes",
			contextWindowTokens: 200_000,
		});

		expect(await selectedModel()).toMatchObject({
			model: { provider: "hermes.chat", modelId: "synthetic-hermes" },
			modelContextWindowTokens: 32768,
		});
	});

	it("goes back to the fallback when the choice is cleared", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});
		await writeAgentModel(db, null);

		expect((await selectedModel()).model.modelId).toBe("synthetic-hermes");
		expect((await readAgentModel(db)).isDefault).toBe(true);
	});

	it("keeps one row rather than accumulating one per change", async () => {
		await writeAgentModel(db, { id: "openai/gpt-5.5", contextWindowTokens: 1 });
		await writeAgentModel(db, { id: "zai/glm-5.2", contextWindowTokens: 2 });

		expect(await db.appSetting.count()).toBe(1);
		expect((await readAgentModel(db)).id).toBe("zai/glm-5.2");
	});

	it("refuses an existing vendor model instead of silently changing providers", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});
		const selected = await selectedModel();
		await expect(selected.model.doGenerate({ prompt: [] })).rejects.toThrow(
			"not approved",
		);
	});
});
