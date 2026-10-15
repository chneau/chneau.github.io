import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogItem } from "../lib/inventory";
import { type DecodedSave, decodeSave } from "../lib/save-engine/container";
import {
	equipmentCatalogTable,
	itemCatalogTable,
} from "../lib/save-engine/data";

const root = join(import.meta.dir, "..");

export const fixture = (name: string): Uint8Array =>
	new Uint8Array(readFileSync(join(root, "saves", name)));

const openedFixtures = new Map<Uint8Array, Promise<DecodedSave>>();

export const opened = (bytes: Uint8Array): Promise<DecodedSave> => {
	let decoded = openedFixtures.get(bytes);
	if (decoded === undefined) {
		decoded = decodeSave(bytes);
		openedFixtures.set(bytes, decoded);
	}
	return decoded;
};

export const mergedCatalog = async (): Promise<Record<string, CatalogItem>> => {
	const items: Record<string, CatalogItem> = {
		...(await itemCatalogTable()).items,
	};
	for (const [key, equipment] of Object.entries(
		(await equipmentCatalogTable()).items,
	)) {
		items[key] = {
			...items[key],
			name: equipment.name,
			legacy_internal_name_hint: equipment.internalName,
			max_stack: 1,
			legacy_max_stack_hint: 1,
			equipmentCategory: equipment.category,
			addsAsSingleRecord: !equipment.characterEquipment,
		};
	}
	return items;
};

export const catalogOf = (
	items: Record<string, Partial<CatalogItem> & { name: string }>,
): { items: Record<string, CatalogItem> } => ({ items });
