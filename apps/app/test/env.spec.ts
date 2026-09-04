import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

it("uses the private runtime API URL for server requests", () => {
	const result = spawnSync(
		process.execPath,
		[
			"--eval",
			'import { API_URL } from "./lib/env.ts"; process.stdout.write(API_URL);',
		],
		{
			cwd: new URL("..", import.meta.url).pathname,
			encoding: "utf8",
			env: {
				...process.env,
				API_URL: "http://api:3001",
				NEXT_PUBLIC_API_URL: "https://crm.example.test:8443",
			},
		},
	);

	expect(result.status).toBe(0);
	expect(result.stderr).toBe("");
	expect(result.stdout).toBe("http://api:3001");
});
