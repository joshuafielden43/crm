import { defineSandbox } from "eve/sandbox";
import { docker } from "eve/sandbox/docker";
import { SANDBOX } from "../lib/sandbox-config";

export default defineSandbox({
	backend: docker(SANDBOX.docker),
});
