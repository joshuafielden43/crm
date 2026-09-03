import { readHermesConfig } from "@crm/env/hermes";
import { Injectable } from "@nestjs/common";
import type { CatalogModel } from "./settings.contracts";

@Injectable()
export class ModelCatalogService {
	async models(): Promise<CatalogModel[] | null> {
		const config = readHermesConfig();
		return config
			? [
					{
						id: config.modelId,
						name: config.modelId,
						provider: "Hermes",
						contextWindowTokens: config.contextWindowTokens,
						pricing: null,
					},
				]
			: null;
	}

	async find(id: string): Promise<CatalogModel | null> {
		const models = await this.models();
		return models?.find((model) => model.id === id) ?? null;
	}
}
