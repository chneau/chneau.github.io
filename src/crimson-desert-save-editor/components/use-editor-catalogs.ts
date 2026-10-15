import { useEffect, useMemo, useState } from "react";
import type { Catalog, CatalogItem } from "../lib/inventory";
import {
	equipmentCatalogTable,
	type ItemCatalogFile,
	type ItemKnowledgeMapFile,
	itemCatalogTable,
	itemKnowledgeTable,
} from "../lib/save-engine/data";
import type { EquipmentCatalog } from "./equipment-details";

const mergeEquipmentCatalog = (
	base: ItemCatalogFile | null,
	equipment: EquipmentCatalog | null,
): Catalog | null => {
	if (!base) return null;
	const items: Record<string, CatalogItem> = { ...base.items };
	for (const [key, entry] of Object.entries(equipment?.items ?? {})) {
		items[key] = {
			...items[key],
			name: entry.name,
			legacy_internal_name_hint: entry.internalName,
			max_stack: 1,
			legacy_max_stack_hint: 1,
			equipmentCategory: entry.category,
			addsAsSingleRecord: !entry.characterEquipment,
		};
	}
	return { ...base, items };
};

export const useEditorCatalogs = (): {
	catalog: Catalog | null;
	equipmentCatalog: EquipmentCatalog | null;
	knowledgeMap: ItemKnowledgeMapFile | null;
} => {
	const [baseCatalog, setBaseCatalog] = useState<ItemCatalogFile | null>(null);
	const [equipmentCatalog, setEquipmentCatalog] =
		useState<EquipmentCatalog | null>(null);
	const [knowledgeMap, setKnowledgeMap] = useState<ItemKnowledgeMapFile | null>(
		null,
	);

	useEffect(() => {
		void itemCatalogTable()
			.then((table) => setBaseCatalog(table))
			.catch(() => setBaseCatalog(null));
		void itemKnowledgeTable()
			.then((table) => setKnowledgeMap(table))
			.catch(() => setKnowledgeMap(null));
		void equipmentCatalogTable()
			.then((table) => setEquipmentCatalog(table))
			.catch(() => setEquipmentCatalog(null));
	}, []);

	const catalog = useMemo(
		() => mergeEquipmentCatalog(baseCatalog, equipmentCatalog),
		[baseCatalog, equipmentCatalog],
	);
	return { catalog, equipmentCatalog, knowledgeMap };
};
