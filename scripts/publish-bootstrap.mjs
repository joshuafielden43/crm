import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

try {
	await import("./publish.mjs");
} catch (error) {
	console.error(error);
	const path = process.argv[5];
	appendFileSync(
		`${path}.startup-error`,
		`${new Date().toISOString()} ${error.message}\n`,
		{ mode: 0o600 },
	);
	const original = readFileSync(path, "utf8");
	writeFileSync(
		path,
		original.replace(
			'"state": "queued"',
			`"state": "failed", "error": ${JSON.stringify(error.message)}`,
		),
		{ mode: 0o600 },
	);
	process.exitCode = 1;
}
