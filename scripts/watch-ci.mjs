import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { PUBLISH } from "./publish-config.mjs";
import { parseRuns } from "./publish-schemas.mjs";
import { FORK } from "./push-guard.mjs";

const gh = (...args) =>
	execFileSync("gh", args, {
		encoding: "utf8",
		timeout: PUBLISH.commandTimeoutMs,
		env: { ...process.env, GH_REPO: FORK },
	}).trim();

export async function watchCi(
	sha,
	run = gh,
	sleep = setTimeout,
	now = Date.now,
) {
	const deadline = now() + PUBLISH.watchTimeoutMs;
	const registrationDeadline = now() + PUBLISH.registrationTimeoutMs;
	let stable = 0;
	let previous = "";
	while (now() < deadline) {
		const runs = parseRuns(
			run(
				"run",
				"list",
				"--repo",
				FORK,
				"--commit",
				sha,
				"--limit",
				String(PUBLISH.maxRuns),
				"--json",
				"databaseId,status,conclusion,workflowName,url,headSha",
			),
		);
		if (runs.length >= PUBLISH.maxRuns)
			throw new Error("CI run list reaches its coverage limit.");
		const signature = JSON.stringify(runs);
		stable = signature === previous ? stable + 1 : 0;
		previous = signature;
		if (runs.some((item) => item.headSha !== sha))
			throw new Error("CI returned an unexpected commit.");
		if (
			runs.length &&
			runs.every((item) => item.status === "completed") &&
			stable >= PUBLISH.settlePolls
		) {
			for (const item of runs)
				console.log(`${item.workflowName}: ${item.conclusion} ${item.url}`);
			const failures = runs.filter((item) => item.conclusion !== "success");
			for (const item of failures)
				console.error(
					run(
						"run",
						"view",
						String(item.databaseId),
						"--repo",
						FORK,
						"--log-failed",
					),
				);
			if (failures.length || !runs.some((item) => item.workflowName === "CI"))
				throw new Error("CI does not pass for the published commit.");
			return runs;
		}
		if (!runs.length && now() >= registrationDeadline)
			throw new Error("No CI run registers for the published commit.");
		await sleep(PUBLISH.pollMs);
	}
	throw new Error("CI watch reaches its 25-minute deadline.");
}
