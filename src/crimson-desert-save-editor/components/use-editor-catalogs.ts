import { useEffect, useMemo, useState } from "react";
import type { EquipmentCatalog } from "@/components/equipment-details";
import type { Catalog, CatalogItem } from "@/lib/inventory";
import {
	equipmentCatalogTable,
	type ItemCatalogFile,
	type ItemKnowledgeMapFile,
	itemCatalogTable,
	itemKnowledgeTable,
} from "@/lib/save-engine/data";

/**
 * The item catalog with every piece of equipment folded into it.
 *
 * Equipment is not in the shipped item catalog — it is read from a second
 * table — but every panel that names an item reads it as one list, and a key
 * that is only in the equipment table would otherwise come out as "Unknown item
 * 12345". Folding them here rather than in each panel means the name, the
 * one-per-record rule and the category are decided once.
 *
 * A failed read leaves that catalog `null` rather than throwing: the editor is
 * usable without names, and a missing item catalog must not take the page with
 * it. The header says "catalog loading" in that state.
 */
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

/**
 * The three generated tables the editor reads once, on mount.
 *
 * They are shipped as JSON and read through the engine's table helpers, which
 * is why this is a hook rather than a module constant: the read is asynchronous
 * and each table failing is independent of the others.
 */
export const useEditorCatalogs = (): {
	/** The merged item catalog, or `null` until it has been read. */
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
