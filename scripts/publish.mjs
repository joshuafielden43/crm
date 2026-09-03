import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	closeSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseReceipt } from "./publish-schemas.mjs";
import { DESTINATION, git, guard } from "./push-guard.mjs";
import { watchCi } from "./watch-ci.mjs";

const root = git("rev-parse", "--show-toplevel");
process.chdir(root);
const directory = join(
	git("rev-parse", "--path-format=absolute", "--git-common-dir"),
	"publish",
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const [mode, commit, ref] = process.argv.slice(2);

function save(path, value) {
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(
		temporary,
		JSON.stringify({ ...value, updatedAt: new Date().toISOString() }, null, 2),
		{ mode: 0o600 },
	);
	renameSync(temporary, path);
}

if (mode === "status") {
	for (const file of readdirSync(directory).filter((name) =>
		name.endsWith(".json"),
	))
		console.log(
			JSON.stringify(
				parseReceipt(readFileSync(join(directory, file), "utf8")),
				null,
				2,
			),
		);
} else if (mode === "queue") {
	guard("origin", DESTINATION);
	const sha = git("rev-parse", "HEAD");
	const branch = git("symbolic-ref", "--quiet", "HEAD");
	const key = `${sha}-${createHash("sha256").update(branch).digest("hex").slice(0, 12)}`;
	const path = join(directory, `${key}.json`);
	const log = join(directory, `${key}.log`);
	save(path, { sha, branch, destination: DESTINATION, state: "queued", log });
	const runtime = join(directory, `${key}-${process.pid}-runtime`);
	mkdirSync(runtime, { mode: 0o700 });
	for (const name of [
		"publish.mjs",
		"push-guard.mjs",
		"watch-ci.mjs",
		"publish-config.mjs",
		"publish-schemas.mjs",
		"publish-bootstrap.mjs",
	]) {
		writeFileSync(
			join(runtime, name),
			`${git("show", `${sha}:scripts/${name}`)}\n`,
			{ mode: 0o600 },
		);
	}
	symlinkSync(join(root, "node_modules"), join(runtime, "node_modules"), "dir");
	const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
	writeFileSync(
		join(runtime, "pre-push"),
		`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(runtime, "push-guard.mjs"))} "$@"\n`,
		{ mode: 0o700 },
	);
	const fd = openSync(log, "a", 0o600);
	const env = { ...process.env };
	for (const name of git("rev-parse", "--local-env-vars").split("\n"))
		delete env[name];
	const child = spawn(
		process.execPath,
		[join(runtime, "publish-bootstrap.mjs"), "run", sha, branch, path],
		{
			cwd: root,
			env,
			detached: true,
			stdio: ["ignore", fd, fd],
		},
	);
	child.on("error", (error) =>
		save(path, {
			sha,
			branch,
			destination: DESTINATION,
			state: "failed",
			error: error.message,
			log,
		}),
	);
	child.unref();
	closeSync(fd);
	console.log(`Background push and CI watch queued: ${path}`);
} else if (mode === "run") {
	const path = process.argv[5];
	const receipt = parseReceipt(readFileSync(path, "utf8"));
	try {
		guard("origin", DESTINATION);
		if (!/^[a-f0-9]{40,64}$/.test(commit) || !ref?.startsWith("refs/heads/"))
			throw new Error("Invalid publish target.");
		save(path, { ...receipt, state: "pushing", pid: process.pid });
		let ciSha = commit;
		try {
			console.log(
				git(
					"-c",
					`core.hooksPath=${fileURLToPath(new URL(".", import.meta.url))}`,
					"push",
					"origin",
					`${commit}:${ref}`,
				),
			);
		} catch (error) {
			const remote = git("ls-remote", "--exit-code", "origin", ref).split(
				/\s+/,
			)[0];
			git("merge-base", "--is-ancestor", commit, remote);
			ciSha = remote;
			console.log(
				`Commit already exists in remote descendant ${ciSha}: ${error.message}`,
			);
		}
		save(path, { ...receipt, state: "watching", ciSha, pid: process.pid });
		const runs = await watchCi(ciSha);
		save(path, { ...receipt, state: "passed", ciSha, runs });
	} catch (error) {
		console.error(error);
		save(path, { ...receipt, state: "failed", error: error.message });
		process.exitCode = 1;
	}
} else {
	throw new Error("Use queue or status.");
}
