import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseReceipt } from "../publish-schemas.mjs";
import { DESTINATION, FORK, guard, guardRefs } from "../push-guard.mjs";
import { watchCi } from "../watch-ci.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha = "a".repeat(40);
const zero = "0".repeat(40);

test("only the named origin and exact fork URL pass", () => {
	assert.doesNotThrow(() =>
		guard("origin", DESTINATION, (...args) =>
			args[0] === "config" ? "false" : DESTINATION,
		),
	);
	assert.throws(() =>
		guard("origin", DESTINATION, (...args) =>
			args[0] === "config" ? "initial" : DESTINATION,
		),
	);
	for (const [remote, url] of [
		["upstream", DESTINATION],
		[DESTINATION, DESTINATION],
		["origin", "https://github.com/trycompai/crm.git"],
		["origin", `${DESTINATION}.evil`],
		["origin", "file:///tmp/repo"],
	])
		assert.throws(() => guard(remote, url, () => DESTINATION));
	assert.throws(() =>
		guard(
			"origin",
			DESTINATION,
			() => `${DESTINATION}\nhttps://github.com/trycompai/crm.git`,
		),
	);
	assert.throws(() =>
		guard("origin", DESTINATION, () => "https://github.com/trycompai/crm.git"),
	);
});

test("branch updates cannot delete, push tags, or rewrite history", () => {
	assert.doesNotThrow(() => guardRefs(`HEAD ${sha} refs/heads/main ${zero}`));
	assert.throws(() => guardRefs(`(delete) ${zero} refs/heads/main ${sha}`));
	assert.throws(() => guardRefs(`HEAD ${sha} refs/tags/v1 ${zero}`));
	assert.throws(() =>
		guardRefs(`HEAD ${sha} refs/heads/main ${"b".repeat(40)}`, () => {
			throw new Error("not ancestor");
		}),
	);
});

test("old hook skip flag does not bypass destination protection", () => {
	const result = spawnSync(
		"sh",
		[".githooks/pre-push", "upstream", "https://github.com/trycompai/crm.git"],
		{
			cwd: root,
			env: { ...process.env, CRM_SKIP_HOOKS: "1" },
			encoding: "utf8",
			input: "",
		},
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Push blocked/);
});

const completed = (id, name = "CI", conclusion = "success") => ({
	databaseId: id,
	workflowName: name,
	conclusion,
	status: "completed",
	url: `https://github.com/${FORK}/actions/runs/${id}`,
	headSha: sha,
});

test("watcher pins repository and SHA and waits for late sibling workflows", async () => {
	let lists = 0;
	const runs = await watchCi(
		sha,
		(...args) => {
			assert.equal(args[args.indexOf("--repo") + 1], FORK);
			assert.equal(args[args.indexOf("--commit") + 1], sha);
			lists += 1;
			return JSON.stringify(
				lists === 1 ? [completed(1)] : [completed(1), completed(2, "Other")],
			);
		},
		async () => {},
	);
	assert.equal(runs.length, 2);
	assert.equal(lists, 4);
});

test("one failed sibling prevents a pass and collects its logs", async () => {
	let logs = 0;
	await assert.rejects(
		watchCi(
			sha,
			(...args) => {
				if (args.includes("--log-failed")) {
					logs += 1;
					return "failed-step output";
				}
				return JSON.stringify([completed(1), completed(2, "Other", "failure")]);
			},
			async () => {},
		),
		/does not pass/,
	);
	assert.equal(logs, 1);
});

test("wrong commit, missing CI, and skipped CI never pass", async () => {
	for (const runs of [
		[{ ...completed(1), headSha: "b".repeat(40) }],
		[completed(1, "Other")],
		[completed(1, "CI", "skipped")],
	]) {
		await assert.rejects(
			watchCi(
				sha,
				(...args) =>
					args.includes("--log-failed") ? "" : JSON.stringify(runs),
				async () => {},
			),
		);
	}
});

test("malformed CI evidence and stored receipts fail validation", async () => {
	for (const value of [
		null,
		{},
		[{ ...completed(1), url: undefined }],
		[{ ...completed(1), databaseId: undefined }],
		[{ ...completed(1), url: "https://example.invalid/run" }],
	]) {
		await assert.rejects(
			watchCi(
				sha,
				() => JSON.stringify(value),
				async () => {},
			),
		);
	}
	assert.throws(() => parseReceipt('{"state":"passed"}'));
	const base = {
		sha,
		branch: "refs/heads/main",
		destination: DESTINATION,
		log: "/tmp/test.log",
		updatedAt: new Date().toISOString(),
	};
	assert.throws(() =>
		parseReceipt(JSON.stringify({ ...base, state: "passed" })),
	);
	assert.throws(() =>
		parseReceipt(
			JSON.stringify({
				...base,
				state: "passed",
				ciSha: sha,
				runs: [completed(1, "CI", "failure")],
			}),
		),
	);
	assert.equal(
		parseReceipt(
			JSON.stringify({ ...base, state: "failed", error: "spawn failed" }),
		).state,
		"failed",
	);
});

test("missing and unfinished workflows reach failed terminal deadlines", async () => {
	for (const runs of [
		[],
		[{ ...completed(1), status: "in_progress", conclusion: "" }],
	]) {
		let clock = 0;
		await assert.rejects(
			watchCi(
				sha,
				() => JSON.stringify(runs),
				async () => {
					clock += 120000;
				},
				() => clock,
			),
			/No CI run|deadline/,
		);
	}
});

test("disabled HTTP redirects prevent Git from contacting the redirected endpoint", async () => {
	let redirects = 0;
	const server = createServer((request, response) => {
		if (request.url.startsWith("/source/")) {
			response.writeHead(302, {
				Location: `http://127.0.0.1:${server.address().port}/destination/info/refs?service=git-upload-pack`,
			});
		} else {
			redirects += 1;
			response.writeHead(404);
		}
		response.end();
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const url = `http://127.0.0.1:${server.address().port}/source`;
		const run = (follow) =>
			promisify(execFile)(
				"git",
				[
					"-c",
					"protocol.http.allow=always",
					"-c",
					`http.followRedirects=${follow}`,
					"ls-remote",
					url,
				],
				{
					cwd: tmpdir(),
					env: {
						...process.env,
						GIT_CONFIG_GLOBAL: "/dev/null",
						GIT_CONFIG_NOSYSTEM: "1",
					},
				},
			);
		await assert.rejects(run("false"));
		assert.equal(redirects, 0);
		await assert.rejects(run("initial"));
		assert.ok(redirects > 0);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
});

test("a real commit queues a background fork push and produces its CI receipt", {
	timeout: 60000,
}, async () => {
	const directory = mkdtempSync(join(tmpdir(), "crm-publish-test-"));
	const repository = join(directory, "repo");
	const bin = join(directory, "bin");
	mkdirSync(repository);
	mkdirSync(bin);
	const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
	const calls = join(directory, "pushes.jsonl");
	const env = {
		...process.env,
		PATH: `${bin}:${process.env.PATH}`,
		GIT_EXEC_PATH: bin,
		CI: "",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_CONFIG_NOSYSTEM: "1",
	};
	const run = (...args) =>
		execFileSync(realGit, args, {
			cwd: repository,
			env,
			encoding: "utf8",
		}).trim();
	try {
		run("init", "-b", "main");
		run("config", "user.name", "Hook Test");
		run("config", "user.email", "hook@example.invalid");
		run("config", "protocol.allow", "never");
		run("commit", "--allow-empty", "-m", "test: base without hooks");
		run("branch", "without-hooks");
		run("remote", "add", "origin", DESTINATION);
		run("remote", "add", "upstream", "https://github.com/trycompai/crm.git");
		cpSync(join(root, "scripts"), join(repository, "scripts"), {
			recursive: true,
		});
		cpSync(join(root, ".githooks"), join(repository, ".githooks"), {
			recursive: true,
		});
		symlinkSync(
			join(root, "node_modules"),
			join(repository, "node_modules"),
			"dir",
		);
		writeFileSync(join(repository, ".gitignore"), "node_modules\n");
		writeFileSync(
			join(bin, "git"),
			`#!${process.execPath}\nconst fs=require('node:fs');const cp=require('node:child_process');const args=process.argv.slice(2);if(args.includes('push')){fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');process.exit(0);}const r=cp.spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'});process.exit(r.status??1);\n`,
			{ mode: 0o755 },
		);
		writeFileSync(
			join(bin, "gh"),
			`#!${process.execPath}\nconst args=process.argv.slice(2);if(args[args.indexOf('--repo')+1]!==${JSON.stringify(FORK)})process.exit(1);console.log(JSON.stringify([{databaseId:1,workflowName:'CI',headSha:args[args.indexOf('--commit')+1],status:'completed',conclusion:'success',url:'https://github.com/${FORK}/actions/runs/1'}]));\n`,
			{ mode: 0o755 },
		);
		execFileSync(process.execPath, ["scripts/install-hooks.mjs"], {
			cwd: repository,
			env,
		});
		assert.equal(
			run("config", "remote.upstream.pushurl"),
			"disabled://upstream-read-only",
		);
		assert.equal(run("config", "remote.pushDefault"), "origin");
		run("add", ".");
		run("commit", "-m", "test: exercise commit hook");
		const expected = run("rev-parse", "HEAD");
		run("checkout", "without-hooks");
		assert.equal(existsSync(join(repository, "scripts")), false);
		const receipts = join(repository, ".git", "publish");
		let receipt;
		for (let attempt = 0; attempt < 400; attempt += 1) {
			const file =
				existsSync(receipts) &&
				readdirSync(receipts).find((name) => name.endsWith(".json"));
			if (file)
				receipt = JSON.parse(readFileSync(join(receipts, file), "utf8"));
			if (receipt?.state === "passed" || receipt?.state === "failed") break;
			await setTimeout(100);
		}
		assert.equal(receipt?.state, "passed", JSON.stringify(receipt));
		assert.equal(receipt.sha, expected);
		assert.equal(receipt.ciSha, expected);
		const push = JSON.parse(readFileSync(calls, "utf8").trim());
		assert.equal(push[0], "-c");
		assert.match(push[1], /core.hooksPath=.*-runtime\//);
		assert.deepEqual(push.slice(2), [
			"push",
			"origin",
			`${expected}:refs/heads/main`,
		]);
		assert.equal(run("branch", "--show-current"), "without-hooks");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
