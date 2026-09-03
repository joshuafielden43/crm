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
import { db, type Prisma } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { Test, type TestingModule } from "@nestjs/testing";
import { SettingsService } from "../src/settings/settings.service";

const originalEnv = { ...process.env };
let saved: Prisma.AppSettingUncheckedCreateInput | null = null;
let module: TestingModule;
let settings: SettingsService;

beforeAll(async () => {
	process.env.BETTER_AUTH_SECRET ||= "synthetic-secret-at-least-32-characters";
	process.env.ALLOWED_SIGN_IN ||= "example.com";
	const { AppModule } = await import("../src/app.module");
	module = await Test.createTestingModule({ imports: [AppModule] }).compile();
	settings = module.get(SettingsService);
	saved = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
});

beforeEach(async () => {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	process.env.HERMES_BASE_URL = "http://127.0.0.1:8642/v1";
	process.env.HERMES_API_KEY = "synthetic-key";
	process.env.HERMES_MODEL_ID = "synthetic-hermes";
	process.env.HERMES_CONTEXT_WINDOW = "32768";
});

afterEach(async () => {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	process.env = { ...originalEnv };
});

afterAll(async () => {
	if (saved) await db.appSetting.create({ data: saved });
	await module.close();
});

describe("model chooser", () => {
	it("saves only the configured Hermes model and resets to that model", async () => {
		const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("Unexpected network request"),
		);
		try {
			expect(
				(await settings.setAgentModel("synthetic-hermes")).effectiveId,
			).toBe("synthetic-hermes");
			expect((await settings.agentModel()).selectedId).toBe("synthetic-hermes");
			await expect(
				settings.setAgentModel("anthropic/claude-sonnet-5"),
			).rejects.toThrow("not configured for Hermes");
			expect((await settings.agentModel()).selectedId).toBe("synthetic-hermes");
			expect(await settings.setAgentModel(null)).toMatchObject({
				selectedId: null,
				effectiveId: "synthetic-hermes",
				defaultId: "synthetic-hermes",
			});
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			fetch.mockRestore();
		}
	});

	it("reports unavailable without configuration and refuses model selection", async () => {
		delete process.env.HERMES_API_KEY;
		expect(await settings.modelCatalog()).toEqual({
			models: [],
			available: false,
		});
		await expect(settings.setAgentModel("synthetic-hermes")).rejects.toThrow(
			"Hermes is not configured",
		);
		expect((await settings.agentModel()).effectiveId).toBe(
			"hermes-unconfigured",
		);
	});
});
