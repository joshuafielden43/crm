import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorld } from "../node_modules/eve/dist/src/compiled/@workflow/world-local/index.js";

for (const boundary of ["event", "projection", "legacy"] as const) {
	it(`recovers a completion interrupted before its ${boundary} write without executing the step again`, async () => {
		const directory = await mkdtemp(join(tmpdir(), "crm-completion-"));
		const world = createWorld({
			dataDir: directory,
			baseUrl: "http://127.0.0.1:1",
			recoverActiveRuns: false,
		});
		try {
			const child = spawnSync(
				process.execPath,
				[
					new URL("./fixtures/workflow-completion-crash.mjs", import.meta.url)
						.pathname,
					directory,
					boundary,
				],
				{ encoding: "utf8" },
			);
			expect(child.stderr).toBe("");
			expect(child.status).toBe(71);
			const runId = await readFile(join(directory, "run-id"), "utf8");
			const markers = await readdir(join(directory, ".locks", "steps"));
			if (boundary === "legacy") {
				for (const marker of markers.filter((name) =>
					name.endsWith(".terminal"),
				))
					await writeFile(join(directory, ".locks", "steps", marker), "");
			}
			expect(
				(await world.events.list({ runId })).data.filter(
					(event) => event.eventType === "step_completed",
				),
			).toHaveLength(0);
			await world.start();
			await world.start();
			const events = (await world.events.list({ runId })).data.filter(
				(event) => event.eventType === "step_completed",
			);
			expect(events).toHaveLength(1);
			expect(events[0]?.eventData).toEqual({ result: new Uint8Array([42]) });
			const steps = (await world.steps.list({ runId })).data;
			expect(steps).toHaveLength(1);
			expect(steps[0]?.status).toBe("completed");
			expect(steps[0]?.attempt).toBe(1);
			expect(steps[0]?.output).toEqual(new Uint8Array([42]));
		} finally {
			await world.close();
			await rm(directory, { recursive: true, force: true });
		}
	});
}
