import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISH } from "./publish-config.mjs";

export const FORK = "joshuafielden43/crm";
export const DESTINATION = `https://github.com/${FORK}.git`;
export const git = (...args) =>
	execFileSync("git", args, {
		encoding: "utf8",
		timeout: PUBLISH.commandTimeoutMs,
	}).trim();

export function guard(remote, destination, run = git) {
	if (remote !== "origin" || destination !== DESTINATION) {
		throw new Error(`Push blocked. Only origin at ${DESTINATION} is allowed.`);
	}
	for (const args of [
		["remote", "get-url", "--all", "origin"],
		["remote", "get-url", "--push", "--all", "origin"],
	]) {
		if (run(...args) !== DESTINATION) {
			throw new Error(
				"Push blocked. Origin URLs must identify only the privacy fork.",
			);
		}
	}
	if (
		run("config", "--get-urlmatch", "http.followRedirects", DESTINATION) !==
		"false"
	) {
		throw new Error(
			"Push blocked. HTTP redirects must be disabled for the fork.",
		);
	}
}

export function guardRefs(input, run = git) {
	for (const line of input.trim().split("\n").filter(Boolean)) {
		const [, local, remoteRef, previous] = line.split(/\s+/);
		if (!local || !previous || !remoteRef?.startsWith("refs/heads/")) {
			throw new Error(
				"Push blocked. Only explicit branch updates are allowed.",
			);
		}
		if (/^0+$/.test(local))
			throw new Error("Push blocked. Branch deletion is disabled.");
		if (!/^0+$/.test(previous))
			run("merge-base", "--is-ancestor", previous, local);
	}
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		guard(process.argv[2], process.argv[3]);
		guardRefs(readFileSync(0, "utf8"));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
