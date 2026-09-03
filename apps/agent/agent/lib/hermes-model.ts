import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
	HERMES_REQUEST,
	HERMES_UNCONFIGURED,
	readHermesConfig,
} from "@crm/env/hermes";

export function blockedSelection(reason?: string) {
	return {
		model: blockedModel(reason),
		modelContextWindowTokens: HERMES_UNCONFIGURED.contextWindowTokens,
	};
}

export function hermesSelection(modelId: string) {
	return {
		model: hermesModel(modelId),
		modelContextWindowTokens:
			readHermesConfig()?.contextWindowTokens ??
			HERMES_UNCONFIGURED.contextWindowTokens,
	};
}

export function blockedModel(
	reason = "Hermes is not configured",
): LanguageModelV4 {
	return {
		specificationVersion: "v4",
		provider: "hermes.chat",
		modelId: HERMES_UNCONFIGURED.id,
		supportedUrls: {},
		doGenerate: async () => {
			throw new Error(reason);
		},
		doStream: async () => {
			throw new Error(reason);
		},
	};
}

export function hermesModel(modelId?: string): LanguageModelV4 {
	const config = readHermesConfig();
	if (!config) return blockedModel();
	if (modelId && modelId !== config.modelId)
		return blockedModel("This model is not approved for Hermes");
	const endpoint = `${config.baseURL}/chat/completions`;
	return createOpenAI({
		name: "hermes",
		baseURL: config.baseURL,
		apiKey: config.apiKey,
		fetch: async (input, init) => {
			const url = input instanceof Request ? input.url : input.toString();
			if (url !== endpoint)
				throw new Error("Hermes request destination refused");
			return globalThis.fetch(input, {
				...init,
				redirect: "error",
				signal: AbortSignal.any([
					AbortSignal.timeout(HERMES_REQUEST.timeoutMs),
					...(init?.signal ? [init.signal] : []),
				]),
			});
		},
	}).chat(config.modelId);
}
