import { HERMES_UNCONFIGURED } from "@crm/env/hermes";
import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import { blockedModel } from "../../lib/hermes-model";
import { selectedModel } from "../../lib/model";

export default defineAgent({
	modelContextWindowTokens: HERMES_UNCONFIGURED.contextWindowTokens,
	description:
		"Turn one private CRM builder-chat request into a validated, reviewable team-agent version without deploying it.",
	model: defineDynamic({
		fallback: blockedModel(),
		events: { "step.started": () => selectedModel() },
	}),
	outputSchema: z.object({
		status: z.literal("draft_ready"),
		summary: z.string().min(1).max(1000),
		agentId: z.string().min(1),
		versionId: z.string().min(1),
	}),
	limits: {
		maxInputTokensPerSession: 100_000,
		maxOutputTokensPerSession: 10_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});
