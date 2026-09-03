import { z } from "zod";
import { DESTINATION, FORK } from "./push-guard.mjs";

const sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const ciRun = z
	.object({
		databaseId: z.number().int().positive(),
		workflowName: z.string().min(1),
		headSha: sha,
		status: z.enum([
			"queued",
			"in_progress",
			"completed",
			"waiting",
			"requested",
			"pending",
		]),
		conclusion: z.string().nullable(),
		url: z.url(),
	})
	.strict()
	.refine(
		(run) =>
			run.url === `https://github.com/${FORK}/actions/runs/${run.databaseId}`,
		"Unexpected CI receipt URL",
	);
const runList = z.array(ciRun);
const base = {
	sha,
	branch: z.string().startsWith("refs/heads/"),
	destination: z.literal(DESTINATION),
	log: z.string().min(1),
	updatedAt: z.iso.datetime(),
};
const pid = z.number().int().positive();
const receipt = z
	.discriminatedUnion("state", [
		z.object({ ...base, state: z.literal("queued") }).strict(),
		z.object({ ...base, state: z.literal("pushing"), pid }).strict(),
		z
			.object({ ...base, state: z.literal("watching"), pid, ciSha: sha })
			.strict(),
		z
			.object({ ...base, state: z.literal("failed"), error: z.string() })
			.strict(),
		z
			.object({
				...base,
				state: z.literal("passed"),
				ciSha: sha,
				runs: runList.nonempty(),
			})
			.strict(),
	])
	.refine(
		(value) =>
			value.state !== "passed" ||
			(value.runs.some((run) => run.workflowName === "CI") &&
				value.runs.every(
					(run) =>
						run.headSha === value.ciSha &&
						run.status === "completed" &&
						run.conclusion === "success",
				)),
		"Passed receipts require successful CI evidence for the published commit",
	);

export const parseRuns = (text) => runList.parse(JSON.parse(text));
export const parseReceipt = (text) => receipt.parse(JSON.parse(text));
