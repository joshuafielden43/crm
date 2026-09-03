import { resolve } from "node:path";
import { DESTINATION, git } from "./push-guard.mjs";

if (!process.env.CI) {
	if (git("rev-parse", "--show-toplevel") !== resolve("."))
		throw new Error("Run hook setup from the repository root.");
	if (git("remote", "get-url", "--all", "origin") !== DESTINATION)
		throw new Error(`Refusing hook setup outside ${DESTINATION}`);
	git(
		"config",
		"--local",
		"--replace-all",
		"remote.origin.pushurl",
		DESTINATION,
	);
	git("config", "--local", "remote.origin.mirror", "false");
	git("config", "--local", "http.followRedirects", "false");
	git("config", "--local", `http.${DESTINATION}.followRedirects`, "false");
	if (git("remote").split("\n").includes("upstream")) {
		git(
			"config",
			"--local",
			"--replace-all",
			"remote.upstream.pushurl",
			"disabled://upstream-read-only",
		);
	}
	git("config", "--local", "remote.pushDefault", "origin");
	git("config", "--local", "push.default", "current");
	for (const branch of git(
		"for-each-ref",
		"--format=%(refname:short)",
		"refs/heads",
	).split("\n")) {
		if (branch)
			git("config", "--local", `branch.${branch}.pushRemote`, "origin");
	}
	git("config", "--local", "core.hooksPath", ".githooks");
	console.log(
		`Hooks installed. Every commit publishes only to ${DESTINATION}.`,
	);
}
