import { promises as fs } from "node:fs";
import { createWorld } from "../../node_modules/eve/dist/src/compiled/@workflow/world-local/index.js";

const dir = process.argv[2];
const w = createWorld({
	dataDir: dir,
	baseUrl: "http://127.0.0.1:1",
	recoverActiveRuns: false,
});
const { run } = await w.events.create(null, {
	eventType: "run_created",
	specVersion: 5,
	eventData: {
		deploymentId: "test",
		workflowName: "workflow//test//cancel",
		input: new Uint8Array(),
	},
});
const id = run.runId;
const step = "step_01M1NF2P3V20KAZQ26283GTYY3";
await w.events.create(id, { eventType: "run_started", specVersion: 5 });
await w.events.create(id, {
	eventType: "step_created",
	specVersion: 5,
	correlationId: step,
	eventData: { stepName: "cancelDescendantTurnsStep", input: new Uint8Array() },
});
await w.events.create(id, {
	eventType: "step_started",
	specVersion: 5,
	correlationId: step,
});
await fs.writeFile(`${dir}/run-id`, id);
const rename = fs.rename;
fs.rename = async (a, b) => {
	if (process.argv[3] === "projection" && String(b).includes("/steps/"))
		process.exit(71);
	return rename(a, b);
};
const link = fs.link;
fs.link = async (a, b) => {
	if (String(b).includes("/events/")) process.exit(71);
	return link(a, b);
};
await w.events.create(id, {
	eventType: "step_completed",
	specVersion: 5,
	correlationId: step,
	eventData: { result: new Uint8Array([42]) },
});
