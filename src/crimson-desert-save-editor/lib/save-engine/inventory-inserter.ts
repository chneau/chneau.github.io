/**
 * TypeScript port of `public/python/editor/inventory_inserter.py`.
 */

import { concatBytes, readU32, writeI64, writeU16, writeU32 } from "./bytes";
import { defined } from "./defined";
import { readInventory } from "./inventory-reader";
import {
	rebaseClonePointers,
	shiftExistingBlockPointers,
	unusedItemNo,
	writeListCount,
} from "./parc";
import {
	findInventoryCategories,
	findInventoryTocIndex,
	parseParcBlob,
	serializeParc,
} from "./parc-serializer";
import { transactSave } from "./transaction";

type InsertInventoryItemOptions = {
	inventoryKey: number;
	templateItemKey: number;
	newItemKey: number;
	quantity?: number;
};

export const insertInventoryItem = async (
	sourceBytes: Uint8Array,
	options: InsertInventoryItemOptions,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const quantity = options.quantity ?? 1;
	if (quantity < 1) throw new Error("Quantity must be at least one");
	const { bytes, verification, value } = await transactSave(
		sourceBytes,
		"Encoded output",
		({ original }) => {
			const raw = original;
			const before = readInventory(raw);
			if (
				before.some(
					(record) =>
						record.inventoryKey === options.inventoryKey &&
						record.itemKey === options.newItemKey,
				)
			) {
				throw new Error(
					"Safe insertion requires an item not already in the target inventory",
				);
			}
			const templates = before.filter(
				(record) =>
					record.inventoryKey === options.inventoryKey &&
					record.itemKey === options.templateItemKey,
			);
			if (templates.length !== 1) {
				throw new Error(
					`Expected one template record, found ${templates.length}`,
				);
			}
			const template = defined(templates[0], "template record");
			const required = ["_itemNo", "_itemKey", "_slotNo", "_stackCount"];
			if (!required.every((name) => name in template.fieldOffsets)) {
				throw new Error("Template is missing required scalar fields");
			}

			const usedSlots = new Set(
				before
					.filter((record) => record.inventoryKey === options.inventoryKey)
					.map((record) => record.slotNo),
			);
			let newSlot = 0;
			while (usedSlots.has(newSlot)) newSlot += 1;
			const newItemNo = unusedItemNo(raw, before);

			const parc = parseParcBlob(raw);
			const inventoryToc = findInventoryTocIndex(parc);
			if (inventoryToc === undefined) {
				throw new Error("InventorySaveData block was not found");
			}
			const entry = defined(
				parc.tocEntries[inventoryToc],
				"inventory TOC entry",
			);
			const categories = findInventoryCategories(parc, inventoryToc);
			const category = categories.find(
				(value) => value.inventoryKey === options.inventoryKey,
			);
			if (!category?.hasItemList) {
				throw new Error(
					`Inventory ${options.inventoryKey} has no serialized item list`,
				);
			}

			const insertAbs = category.itemsEndAbs;
			const clone = raw.slice(template.recordStart, template.recordEnd);

			for (const [name, value, kind] of [
				["_itemNo", newItemNo, "u64"],
				["_itemKey", options.newItemKey, "u32"],
				["_slotNo", newSlot, "u16"],
				["_stackCount", quantity, "u64"],
				["_transferredItemKey", options.newItemKey, "u32"],
			] as const) {
				if (!(name in template.fieldOffsets)) {
					if (name === "_transferredItemKey") continue;
					throw new Error(`Template is missing required field ${name}`);
				}
				const localOffset =
					(template.fieldOffsets[name] ?? 0) - template.recordStart;
				if (kind === "u64") writeI64(clone, localOffset, BigInt(value));
				else if (kind === "u32") writeU32(clone, localOffset, value);
				else writeU16(clone, localOffset, value);
			}
			rebaseClonePointers(
				clone,
				template.recordStart,
				template.recordEnd,
				insertAbs,
			);

			const oldBlock = parc.blockRaw.get(inventoryToc) ?? new Uint8Array();
			const insertOffset = insertAbs - entry.dataOffset;
			const newBlock = concatBytes(
				oldBlock.slice(0, insertOffset),
				clone,
				oldBlock.slice(insertOffset),
			);
			const delta = clone.length;
			shiftExistingBlockPointers(
				oldBlock,
				newBlock,
				entry.dataOffset,
				insertAbs,
				delta,
			);
			writeListCount(
				newBlock,
				entry.dataOffset,
				category.itemListAbs,
				category.itemCount + 1,
			);

			const categoryTrailer =
				category.elemEndAbs - entry.dataOffset - 4 + delta;
			writeU32(
				newBlock,
				categoryTrailer,
				readU32(newBlock, categoryTrailer) + delta,
			);

			parc.modifiedBlocks.set(inventoryToc, newBlock);
			const editedRaw = serializeParc(parc);
			const after = readInventory(editedRaw);
			const inserted = after.filter(
				(record) =>
					record.inventoryKey === options.inventoryKey &&
					record.itemKey === options.newItemKey &&
					record.itemNo === newItemNo &&
					record.slotNo === newSlot,
			);
			if (
				inserted.length !== 1 ||
				defined(inserted[0], "inserted record").stackCount !== quantity
			) {
				throw new Error(
					"Inserted item did not reparse exactly once with requested values",
				);
			}
			if (after.length !== before.length + 1) {
				throw new Error(
					"Inventory record count did not increase by exactly one",
				);
			}
			const beforeSignatures = new Set(
				before.map(
					(record) =>
						`${record.inventoryKey}:${record.itemNo}:${record.itemKey}:${record.slotNo}:${record.stackCount}`,
				),
			);
			const afterSignatures = new Set(
				after.map(
					(record) =>
						`${record.inventoryKey}:${record.itemNo}:${record.itemKey}:${record.slotNo}:${record.stackCount}`,
				),
			);
			for (const signature of beforeSignatures) {
				if (!afterSignatures.has(signature)) {
					throw new Error("One or more pre-existing inventory records changed");
				}
			}

			return {
				payload: editedRaw,
				value: {
					edit: "insert_inventory_item",
					inventory_key: options.inventoryKey,
					template_item_key: options.templateItemKey,
					new_item_key: options.newItemKey,
					new_item_no: newItemNo,
					new_slot: newSlot,
					quantity,
					transferred_item_key_synchronized:
						"_transferredItemKey" in template.fieldOffsets,
					record_size: clone.length,
					inventory_count_before: before.length,
					inventory_count_after: after.length,
					raw_size_before: raw.length,
					raw_size_after: editedRaw.length,
				},
			};
		},
	);
	return [
		bytes,
		{
			...value,
			...verification,
			inventory_reparsed: true,
			preexisting_records_preserved: true,
		},
	];
};
