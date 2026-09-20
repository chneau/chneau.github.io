/**
 * TypeScript port of `public/python/editor/inventory_reader.py`.
 */

import { readU16 } from "./bytes";
import { defined } from "./defined";
import {
	type ItemSocketRecord,
	listLayout,
	locator,
	parseFieldsWithListTrailers,
	present,
	readObjectListValues,
	readPostListScalarsFromEnd,
} from "./parc";
import { BlockParser, parseParcBlob } from "./parc-serializer";

export type InventoryRecord = {
	inventoryKey: number;
	itemNo: number;
	itemKey: number;
	slotNo: number;
	stackCount: number;
	recordStart: number;
	recordEnd: number;
	fieldOffsets: Record<string, number>;
	values: Record<string, unknown>;
	sockets: ItemSocketRecord[];
};

/**
 * What addresses one inventory record. All three parts belong to the identity:
 * an item can sit in the same slot of two storages, and two slots of one
 * storage can hold the same item, so none of them is optional.
 */
export type InventoryRecordTarget = {
	inventoryKey: number;
	slotNo: number;
	itemKey: number;
};

/**
 * The single record a staged edit addresses. Matching several records (or none)
 * means the caller's target was wrong, so it fails rather than guessing.
 */
export const findInventoryRecord = (
	records: InventoryRecord[],
	target: InventoryRecordTarget,
): InventoryRecord => {
	const matches = records.filter(
		(record) =>
			record.inventoryKey === target.inventoryKey &&
			record.slotNo === target.slotNo &&
			record.itemKey === target.itemKey,
	);
	if (matches.length !== 1) {
		throw new Error(
			`Expected exactly one record for inventory ${target.inventoryKey}, slot ${target.slotNo}, item ${target.itemKey}, found ${matches.length}`,
		);
	}
	return defined(matches[0], "inventory record");
};

export const readInventory = (raw: Uint8Array): InventoryRecord[] => {
	const parc = parseParcBlob(raw);
	const parser = new BlockParser(parc);
	const rootEntry = parc.tocEntries.find(
		(entry) =>
			parc.typeByIndex.get(entry.classIndex)?.name === "InventorySaveData",
	);
	if (!rootEntry) throw new Error("InventorySaveData block was not found");
	const root = parser.parseRootBlock(rootEntry.index);
	const inventoryField = root.fields.find(
		(field) => field.name === "_inventorylist",
	);
	if (
		!inventoryField ||
		inventoryField.start === undefined ||
		inventoryField.end === undefined
	) {
		throw new Error("_inventorylist was not found");
	}
	const [inventoryCount, inventoryCursor] = listLayout(
		raw,
		inventoryField.start,
		inventoryField.end,
	);
	const records: InventoryRecord[] = [];
	let cursor = inventoryCursor;

	for (let index = 0; index < inventoryCount; index++) {
		const elementEnd = parser.parseListElement(cursor, inventoryField.end);
		const [elementType, elementMask, elementPayload] = locator(
			raw,
			cursor,
			parc.typeByIndex,
		);
		const elementDef = parc.typeByIndex.get(elementType);
		if (elementDef?.name !== "InventoryElementSaveData") {
			throw new Error(
				`Expected InventoryElementSaveData, got ${elementDef?.name}`,
			);
		}
		let position = elementPayload + 4;
		let inventoryKey = 0;
		let itemListStart: number | null = null;
		for (
			let fieldIndex = 0;
			fieldIndex < elementDef.fields.length;
			fieldIndex++
		) {
			const field = defined(
				elementDef.fields[fieldIndex],
				"element field definition",
			);
			if (!present(elementMask, fieldIndex)) continue;
			if (field.name === "_inventoryKey") {
				inventoryKey = readU16(raw, position);
			}
			if (field.name === "_itemList") {
				itemListStart = position;
				break;
			}
			if ((field.metaKind === 0 || field.metaKind === 2) && field.metaSize) {
				position += field.metaSize;
			} else {
				position = parser.parseFieldValue(field, position, elementEnd)[1];
			}
		}

		if (itemListStart !== null) {
			const [itemCount, itemCursorStart] = listLayout(
				raw,
				itemListStart,
				elementEnd,
			);
			let itemCursor = itemCursorStart;
			for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
				const itemEnd = parser.parseListElement(itemCursor, elementEnd);
				const [itemType, itemMask, itemPayload] = locator(
					raw,
					itemCursor,
					parc.typeByIndex,
				);
				const itemDef = parc.typeByIndex.get(itemType);
				if (itemDef?.name !== "ItemSaveData") {
					throw new Error(`Expected ItemSaveData, got ${itemDef?.name}`);
				}
				const parsedFields = parseFieldsWithListTrailers(
					raw,
					parser,
					itemDef,
					itemMask,
					itemPayload + 4,
					itemEnd,
				);
				const values: Record<string, unknown> = {};
				const offsets: Record<string, number> = {};
				const wanted = new Set([
					"_itemNo",
					"_itemKey",
					"_slotNo",
					"_stackCount",
				]);
				for (const field of parsedFields) {
					if (!field.present) continue;
					values[field.name] = field.value;
					offsets[field.name] = field.start ?? 0;
				}
				const [trailingValues, trailingOffsets] = readPostListScalarsFromEnd(
					raw,
					parser,
					itemDef,
					itemMask,
					itemEnd,
				);
				Object.assign(values, trailingValues);
				Object.assign(offsets, trailingOffsets);
				let sockets: ItemSocketRecord[] = [];
				const socketField = parsedFields.find(
					(field) => field.present && field.name === "_socketSaveDataList",
				);
				if (
					socketField &&
					socketField.start !== undefined &&
					socketField.end !== undefined
				) {
					sockets = readObjectListValues(
						raw,
						socketField.start,
						socketField.end,
						parser,
						"ItemSocketSaveData",
					);
				}
				if ([...wanted].every((name) => name in values)) {
					records.push({
						inventoryKey,
						itemNo: Number(values._itemNo),
						itemKey: Number(values._itemKey),
						slotNo: Number(values._slotNo),
						stackCount: Number(values._stackCount),
						recordStart: itemCursor,
						recordEnd: itemEnd,
						fieldOffsets: offsets,
						values,
						sockets,
					});
				}
				itemCursor = itemEnd;
			}
		}
		cursor = elementEnd;
	}
	return records;
};
