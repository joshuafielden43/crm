import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchLab } from "../lib/lab-search";

export default defineTool({
	description:
		"Search the configured private lab search service for public web information. Returns source URLs and snippets for cited research. No vendor model call. Prefer this when lab search is configured.",
	inputSchema: z.object({ query: z.string().trim().min(1).max(500) }),
	execute: ({ query }, ctx) => searchLab(query, ctx.abortSignal),
});
