import { z } from "zod";

const hermesConfig = z.object({
	baseURL: z
		.url()
		.refine((value) => {
			if (!URL.canParse(value)) return false;
			const url = new URL(value);
			return (
				["http:", "https:"].includes(url.protocol) &&
				!url.username &&
				!url.password &&
				!url.search &&
				!url.hash
			);
		})
		.transform((value) => value.replace(/\/+$/, "")),
	apiKey: z.string().trim().min(1),
	modelId: z.string().trim().min(1).max(200),
	contextWindowTokens: z.coerce.number().int().positive(),
});

export type HermesConfig = z.infer<typeof hermesConfig>;

export const HERMES_UNCONFIGURED = {
	id: "hermes-unconfigured",
	contextWindowTokens: 32768,
} as const;

export const HERMES_REQUEST = { timeoutMs: 120_000 } as const;

export function readHermesConfig(): HermesConfig | null {
	const result = hermesConfig.safeParse({
		baseURL: process.env.HERMES_BASE_URL,
		apiKey: process.env.HERMES_API_KEY,
		modelId: process.env.HERMES_MODEL_ID,
		contextWindowTokens: process.env.HERMES_CONTEXT_WINDOW,
	});
	return result.success ? result.data : null;
}
