import { db } from "@crm/db";
import { readAgentModel } from "@crm/db/settings";
import { blockedSelection, hermesSelection } from "./hermes-model";

export async function selectedModel() {
	try {
		const setting = await readAgentModel(db);

		return hermesSelection(setting.id);
	} catch {
		return blockedSelection("Hermes model selection is unavailable");
	}
}
