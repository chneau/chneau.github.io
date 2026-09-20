/**
 * TypeScript port of `public/python/editor/item_catalog.py`.
 */

import {
	equipmentCatalogTable,
	type ItemCatalogFile,
	itemCatalogTable,
} from "./data";

type CatalogItem = {
	itemKey: number;
	name: string;
	description: string;
	category: string;
	maxStack: number;
	internalName: string;
};

/** The item and equipment catalog, merged and ready to read by key. */
class CurrentItemCatalog {
	schemaVersion: number;
	steamBuildId: string;
	iteminfoSha256: string;
	items: Map<number, CatalogItem>;

	constructor(
		schemaVersion: number,
		steamBuildId: string,
		iteminfoSha256: string,
		items: Map<number, CatalogItem>,
	) {
		this.schemaVersion = schemaVersion;
		this.steamBuildId = steamBuildId;
		this.iteminfoSha256 = iteminfoSha256;
		this.items = items;
	}

	get(itemKey: number): CatalogItem | undefined {
		return this.items.get(itemKey);
	}

	getName(itemKey: number): string {
		return this.get(itemKey)?.name ?? `Unknown (${itemKey})`;
	}

	getCategory(itemKey: number): string {
		return this.get(itemKey)?.category ?? "Misc";
	}

	isAbyssGear(itemKey: number): boolean {
		return (
			this.get(itemKey)?.internalName.toLowerCase().includes("abyssgear") ??
			false
		);
	}

	search(query: string): CatalogItem[] {
		const needle = query.toLowerCase().trim();
		const matches = [...this.items.values()].filter(
			(item) =>
				!needle ||
				item.name.toLowerCase().includes(needle) ||
				item.internalName.toLowerCase().includes(needle) ||
				String(item.itemKey).includes(needle),
		);
		return matches.sort((a, b) => {
			const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
			return byName !== 0 ? byName : a.itemKey - b.itemKey;
		});
	}
}

/** Public entry point: the committed item and equipment tables, merged. */
export const loadItemCatalog = async (): Promise<CurrentItemCatalog> => {
	const data: ItemCatalogFile = await itemCatalogTable();
	const items = new Map<number, CatalogItem>();
	for (const [rawKey, entry] of Object.entries(data.items)) {
		const key = Number(rawKey);
		items.set(key, {
			itemKey: key,
			name: String(entry.name),
			description: String(entry.description ?? ""),
			category: String(entry.category ?? entry.legacy_category_hint ?? "Misc"),
			maxStack: Number(entry.max_stack ?? entry.legacy_max_stack_hint ?? 0),
			internalName: String(entry.legacy_internal_name_hint ?? ""),
		});
	}

	const equipment = await equipmentCatalogTable();
	for (const [rawKey, entry] of Object.entries(equipment.items)) {
		const key = Number(rawKey);
		const previous = items.get(key);
		items.set(key, {
			itemKey: key,
			name: entry.name,
			description: previous?.description ?? "",
			category: entry.category,
			maxStack: 1,
			internalName: entry.internalName,
		});
	}

	return new CurrentItemCatalog(
		Number(data.schema_version),
		String(data.game?.steam_build_id ?? ""),
		String(data.sources.iteminfo.sha256),
		items,
	);
};
