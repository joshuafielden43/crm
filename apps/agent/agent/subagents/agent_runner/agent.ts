import { db } from "@crm/db";
import { HERMES_UNCONFIGURED } from "@crm/env/hermes";
import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import {
	blockedModel,
	blockedSelection,
	hermesSelection,
} from "../../lib/hermes-model";
import { attribute, purposeOf } from "../../lib/session-purpose";

export default defineAgent({
	modelContextWindowTokens: HERMES_UNCONFIGURED.contextWindowTokens,
	description:
		"Execute one immutable deployed CRM agent version and persist its result and every side effect.",
	model: defineDynamic({
		fallback: blockedModel(),
		events: {
			"step.started": async (_event, ctx) => {
				try {
					if (purposeOf(ctx) !== "team-agent")
						return blockedSelection("Hermes runner context is unavailable");
					const runId = attribute(ctx, "runId");
					if (!runId)
						return blockedSelection("Hermes runner ID is unavailable");

					const run = await db.agentRun.findUnique({
						where: { id: runId },
						select: {
							version: {
								select: { modelId: true },
							},
						},
					});
					return run
						? hermesSelection(run.version.modelId)
						: blockedSelection("Hermes runner version is unavailable");
				} catch {
					return blockedSelection(
						"Hermes runner model selection is unavailable",
					);
				}
			},
		},
	}),
	outputSchema: z.object({
		summary: z.string().min(1).max(1000),
		result: z.record(z.string(), z.unknown()).nullable(),
	}),
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 40_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});
