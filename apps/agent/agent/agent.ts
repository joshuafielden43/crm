import "@crm/env/load";

import { HERMES_UNCONFIGURED } from "@crm/env/hermes";
import { defineAgent, defineDynamic } from "eve";
import { logCapabilities } from "./lib/capabilities";
import { blockedModel } from "./lib/hermes-model";
import { selectedModel } from "./lib/model";

void logCapabilities();

export default defineAgent({
	modelContextWindowTokens: HERMES_UNCONFIGURED.contextWindowTokens,
	model: defineDynamic({
		fallback: blockedModel(),
		events: { "step.started": () => selectedModel() },
	}),
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
});
