/**
 * TypeScript port of `public/python/editor/browser_inventory.py`.
 *
 * Browser stackable additions with authoritative, automatic item discovery.
 */

import { insertInventoryItem } from "./inventory-inserter";
import { applyItemDiscovery, discoveryKeys } from "./item-discovery";

export type InsertBrowserItemEdit = {
	itemKey: number;
	inventoryKey: number;
	templateItemKey: number;
	quantity: number;
	knowledgeKey?: number;
};

export const insertBrowserItem = async (
	source: Uint8Array,
	edit: InsertBrowserItemEdit,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const key = edit.itemKey;
	if (!Number.isInteger(key) || key <= 0) {
		throw new Error("Item key must be a positive whole number.");
	}
	// Older clients can still supply knowledgeKey, but cannot grant unrelated keys.
	await discoveryKeys(key, edit.knowledgeKey);
	const [inserted, audit] = await insertInventoryItem(source, {
		inventoryKey: Math.trunc(edit.inventoryKey),
		templateItemKey: Math.trunc(edit.templateItemKey),
		newItemKey: key,
		quantity: Math.trunc(edit.quantity),
	});
	const [output, discovery] = await applyItemDiscovery(inserted, key);
	return [
		output,
		{
			...audit,
			discovery,
			output_sha256: discovery.output_sha256,
		},
	];
};
