/**
 * TypeScript port of `public/python/editor/donor_equipment_inserter.py`.
 */

import {
	concatBytes,
	indexOfBytes,
	packU64,
	readU16,
	readU32,
	writeI64,
	writeU16,
	writeU32,
} from "./bytes";
import { decodeSave } from "./container";
import { defined } from "./defined";
import { readEquipmentLayout } from "./equipment-loadout";
import { readInventory } from "./inventory-reader";
import { readKnowledge } from "./knowledge-reader";
import {
	listLayout,
	locator,
	parseFieldsWithListTrailers,
	shiftExistingBlockPointers,
	typeSignatureArray,
	writeListCount,
} from "./parc";
import {
	BlockParser,
	findInventoryCategories,
	findInventoryTocIndex,
	parseParcBlob,
	serializeParc,
	type TypeDef,
} from "./parc-serializer";
import { commitSave } from "./transaction";

export const RUNTIME_RESTRICTED_EQUIPMENT: Record<number, string> = {
	1000521:
		"Kairos Plate Helm is entitlement/DLC-gated and is suppressed by the game when its item record is inserted without the corresponding entitlement",
};

const typeSignature = (typeDef: TypeDef): string => {
	return JSON.stringify(typeSignatureArray(typeDef));
};

const readInventoryItemDyes = (
	raw: Uint8Array,
	recordStart: number,
	recordEnd: number,
): Array<Record<string, unknown>> => {
	const parc = parseParcBlob(raw);
	const parser = new BlockParser(parc);
	const [itemTypeIndex, itemMask, itemPayload] = locator(
		raw,
		recordStart,
		parc.typeByIndex,
	);
	const itemType = parc.typeByIndex.get(itemTypeIndex);
	if (!itemType) throw new Error("Item type was not found");
	const parsedFields = parseFieldsWithListTrailers(
		raw,
		parser,
		itemType,
		itemMask,
		itemPayload + 4,
		recordEnd,
	);
	const dyeField = parsedFields.find(
		(field) => field.name === "_itemDyeDataList" && field.present,
	);
	if (!dyeField || dyeField.start === undefined || dyeField.end === undefined) {
		return [];
	}
	const [count, startCursor] = listLayout(raw, dyeField.start, dyeField.end);
	let cursor = startCursor;
	const rows: Array<Record<string, unknown>> = [];
	for (let index = 0; index < count; index++) {
		const elementEnd = parser.parseListElement(cursor, dyeField.end);
		const [typeIndex, mask, payload] = locator(raw, cursor, parc.typeByIndex);
		const typeDef = parc.typeByIndex.get(typeIndex);
		if (typeDef?.name !== "ItemDyeSaveData") {
			throw new Error(`Expected ItemDyeSaveData, got ${typeDef?.name}`);
		}
		const [fields] = parser.parseFields(typeDef, mask, payload + 4, elementEnd);
		const row: Record<string, unknown> = {};
		for (const field of fields) {
			if (field.present) row[field.name] = field.value;
		}
		rows.push(row);
		cursor = elementEnd;
	}
	return rows;
};

type InsertDonorOptions = {
	donorSlot: number;
	inventoryKey?: number;
	stripDyes?: boolean;
	preserveDyes?: boolean;
	allowExperimental?: boolean;
	allowRuntimeRestricted?: boolean;
};

export const insertDonorEquipmentIntoInventory = async (
	donorBytes: Uint8Array,
	targetBytes: Uint8Array,
	options: InsertDonorOptions,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const inventoryKey = options.inventoryKey ?? 2;
	const stripDyes = options.stripDyes ?? false;
	const preserveDyes = options.preserveDyes ?? false;
	const allowExperimental = options.allowExperimental ?? false;
	const allowRuntimeRestricted = options.allowRuntimeRestricted ?? false;

	const donorDecoded = await decodeSave(donorBytes);
	const targetDecoded = await decodeSave(targetBytes);
	const donorRaw = donorDecoded.rawPayload;
	const targetRaw = targetDecoded.rawPayload;
	const donorLayout = readEquipmentLayout(donorRaw);
	const donorMatches = donorLayout.records.filter(
		(record) => record.slotNo === options.donorSlot,
	);
	if (donorMatches.length !== 1) {
		throw new Error(
			`Expected one donor equipped record, found ${donorMatches.length}`,
		);
	}
	const donor = defined(donorMatches[0], "donor equipped record");
	if (
		donor.itemKey in RUNTIME_RESTRICTED_EQUIPMENT &&
		!allowRuntimeRestricted
	) {
		throw new Error(
			defined(
				RUNTIME_RESTRICTED_EQUIPMENT[donor.itemKey],
				"runtime restriction note",
			),
		);
	}
	if (stripDyes && preserveDyes) {
		throw new Error("strip_dyes and preserve_dyes are mutually exclusive");
	}
	if (donor.dyes.length > 0 && stripDyes && !allowExperimental) {
		throw new Error(
			"Dye stripping is disabled: a structurally valid test save crashed the game",
		);
	}
	if (donor.dyes.length > 0 && !(stripDyes || preserveDyes)) {
		throw new Error(
			"Donor equipment contains dye data; a native-dye target and preserve_dyes=True are required",
		);
	}
	if (donor.values._transferredItemKey !== donor.itemKey) {
		throw new Error("Donor equipment identity is desynchronized");
	}

	const beforeInventory = readInventory(targetRaw);
	if (
		beforeInventory.some(
			(record) =>
				record.inventoryKey === inventoryKey &&
				record.itemKey === donor.itemKey,
		)
	) {
		throw new Error("Target inventory already contains the donor item");
	}
	const usedSlots = new Set(
		beforeInventory
			.filter((record) => record.inventoryKey === inventoryKey)
			.map((record) => record.slotNo),
	);
	let newSlot = 0;
	while (usedSlots.has(newSlot)) newSlot += 1;
	let newItemNo =
		Math.max(0, ...beforeInventory.map((record) => record.itemNo)) + 1;
	while (indexOfBytes(targetRaw, packU64(newItemNo)) >= 0) newItemNo += 1;

	const targetParc = parseParcBlob(targetRaw);
	const donorParc = parseParcBlob(donorRaw);
	const targetTypes = new Map(
		targetParc.types.map((kind) => [kind.name, kind]),
	);
	const donorTypes = new Map(donorParc.types.map((kind) => [kind.name, kind]));
	const originalItemLocators = donor.locators.filter(
		(locatorRef) =>
			donor.itemStart <= locatorRef.typeIndexOffset &&
			locatorRef.typeIndexOffset < donor.itemEnd,
	);
	let removedDyeCount = 0;
	let removedStart: number | null = null;
	let removedEnd: number | null = null;
	let clone: Uint8Array = donorRaw.slice(donor.itemStart, donor.itemEnd);

	if (donor.dyes.length > 0 && stripDyes) {
		const donorParser = new BlockParser(donorParc);
		const [itemTypeIndex, itemMask, itemPayload] = locator(
			donorRaw,
			donor.itemStart,
			donorParc.typeByIndex,
		);
		const itemType = donorParc.typeByIndex.get(itemTypeIndex);
		if (!itemType) throw new Error("Donor item type was not found");
		const parsedFields = parseFieldsWithListTrailers(
			donorRaw,
			donorParser,
			itemType,
			itemMask,
			itemPayload + 4,
			donor.itemEnd,
		);
		const dyeIndex = itemType.fields.findIndex(
			(field) => field.name === "_itemDyeDataList",
		);
		const dyeField = defined(parsedFields[dyeIndex], "donor dye field");
		if (!dyeField.present || dyeField.start === undefined) {
			throw new Error("Donor reports dye records but its dye field is absent");
		}
		removedStart = dyeField.start;
		const followingStarts = parsedFields
			.slice(dyeIndex + 1)
			.filter((field) => field.present && field.start !== undefined)
			.map((field) => field.start as number);
		if (followingStarts.length === 0) {
			throw new Error("Could not locate a field following the donor dye list");
		}
		removedEnd = Math.min(...followingStarts);
		if (removedEnd <= removedStart) {
			throw new Error("Invalid donor dye field range");
		}

		const maskCount = readU16(clone, 0);
		if (maskCount <= 0 || maskCount > 16) {
			throw new Error("Dyed donor ItemSaveData does not use a full locator");
		}
		const maskLocal = 2 + Math.floor(dyeIndex / 8);
		const maskBit = 1 << (dyeIndex % 8);
		if (
			maskLocal >= 2 + maskCount ||
			((clone[maskLocal] ?? 0) & maskBit) === 0
		) {
			throw new Error("Donor dye presence bit is not set");
		}
		clone[maskLocal] = (clone[maskLocal] ?? 0) & ~maskBit;

		const deleteStart = removedStart - donor.itemStart;
		const deleteEnd = removedEnd - donor.itemStart;
		const trimmed = concatBytes(
			clone.slice(0, deleteStart),
			clone.slice(deleteEnd),
		);
		const payloadLocal = itemPayload - donor.itemStart;
		const normalizedSize = trimmed.length - 4 - payloadLocal;
		if (normalizedSize < 0) {
			throw new Error("Normalized donor item has an invalid trailing size");
		}
		writeU32(trimmed, trimmed.length - 4, normalizedSize);
		clone = trimmed;
		removedDyeCount = donor.dyes.length;
	}

	const removedRange: readonly [number, number] | null =
		removedStart === null || removedEnd === null
			? null
			: [removedStart, removedEnd];

	const shiftedOffset = (position: number): number => {
		if (removedRange === null) return position;
		const [rangeStart, rangeEnd] = removedRange;
		if (position >= rangeStart && position < rangeEnd) {
			throw new Error("Attempted to retain a locator inside removed dye data");
		}
		return position >= rangeEnd ? position - (rangeEnd - rangeStart) : position;
	};

	const itemLocators = originalItemLocators.filter(
		(locatorRef) =>
			removedRange === null ||
			!(
				locatorRef.typeIndexOffset >= removedRange[0] &&
				locatorRef.typeIndexOffset < removedRange[1]
			),
	);
	const requiredTypes = new Set(
		itemLocators.map((locatorRef) => locatorRef.typeName),
	);
	for (const name of requiredTypes) {
		const targetType = targetTypes.get(name);
		const donorType = donorTypes.get(name);
		if (
			!targetType ||
			!donorType ||
			typeSignature(targetType) !== typeSignature(donorType)
		) {
			throw new Error(`Source and target schemas disagree for ${name}`);
		}
	}

	const inventoryToc = findInventoryTocIndex(targetParc);
	if (inventoryToc === undefined) {
		throw new Error("InventorySaveData block was not found");
	}
	const entry = defined(
		targetParc.tocEntries[inventoryToc],
		"inventory TOC entry",
	);
	const category = findInventoryCategories(targetParc, inventoryToc).find(
		(row) => row.inventoryKey === inventoryKey,
	);
	if (!category?.hasItemList) {
		throw new Error(`Inventory ${inventoryKey} has no serialized item list`);
	}
	const insertAbs = category.itemsEndAbs;

	for (const [fieldName, value, kind] of [
		["_itemNo", newItemNo, "u64"],
		["_slotNo", newSlot, "u16"],
		["_stackCount", 1, "u64"],
	] as const) {
		const local = (donor.fieldOffsets[fieldName] ?? 0) - donor.itemStart;
		if (kind === "u64") writeI64(clone, local, BigInt(value));
		else writeU16(clone, local, value);
	}
	const targetTypeIndices = new Map(
		[...targetTypes].map(([name, kind]) => [name, kind.index]),
	);
	for (const locatorRef of itemLocators) {
		writeU16(
			clone,
			shiftedOffset(locatorRef.typeIndexOffset) - donor.itemStart,
			targetTypeIndices.get(locatorRef.typeName) ?? 0,
		);
		writeU32(
			clone,
			shiftedOffset(locatorRef.payloadPointerOffset) - donor.itemStart,
			insertAbs + shiftedOffset(locatorRef.payloadOffset) - donor.itemStart,
		);
	}

	const oldBlock = targetParc.blockRaw.get(inventoryToc) ?? new Uint8Array();
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
	const categoryTrailer = category.elemEndAbs - entry.dataOffset - 4 + delta;
	writeU32(
		newBlock,
		categoryTrailer,
		readU32(newBlock, categoryTrailer) + delta,
	);

	targetParc.modifiedBlocks.set(inventoryToc, newBlock);
	const editedRaw = serializeParc(targetParc);
	const afterInventory = readInventory(editedRaw);
	const inserted = afterInventory.filter(
		(record) =>
			record.inventoryKey === inventoryKey &&
			record.itemNo === newItemNo &&
			record.itemKey === donor.itemKey &&
			record.slotNo === newSlot,
	);
	if (inserted.length !== 1) {
		throw new Error(
			"Donor equipment did not reparse exactly once in inventory",
		);
	}
	const result = defined(inserted[0], "inserted donor record");
	if (result.values._transferredItemKey !== donor.itemKey) {
		throw new Error("Inserted donor equipment identity is desynchronized");
	}
	if (result.values._enchantLevel !== donor.values._enchantLevel) {
		throw new Error("Inserted donor refinement changed");
	}
	if (
		JSON.stringify(result.sockets.map((socket) => socket.itemKey)) !==
		JSON.stringify(donor.sockets.map((socket) => socket.itemKey))
	) {
		throw new Error("Inserted donor sockets changed");
	}
	const insertedDyes = readInventoryItemDyes(
		editedRaw,
		result.recordStart,
		result.recordEnd,
	);
	const expectedDyes = removedDyeCount ? [] : donor.dyes;
	if (JSON.stringify(insertedDyes) !== JSON.stringify(expectedDyes)) {
		throw new Error("Inserted donor dye records changed");
	}
	const beforeSignatures = new Set(
		beforeInventory.map(
			(record) =>
				`${record.inventoryKey}:${record.itemNo}:${record.itemKey}:${record.slotNo}:${record.stackCount}`,
		),
	);
	const afterSignatures = new Set(
		afterInventory.map(
			(record) =>
				`${record.inventoryKey}:${record.itemNo}:${record.itemKey}:${record.slotNo}:${record.stackCount}`,
		),
	);
	if (afterInventory.length !== beforeInventory.length + 1) {
		throw new Error("Inventory count did not increase by exactly one");
	}
	for (const signature of beforeSignatures) {
		if (!afterSignatures.has(signature)) {
			throw new Error("A pre-existing inventory record changed");
		}
	}

	const equipmentSignature = (raw: Uint8Array): string =>
		JSON.stringify(
			readEquipmentLayout(raw).records.map((record) => [
				record.itemNo,
				record.itemKey,
				record.slotNo,
				record.values._transferredItemKey,
			]),
		);
	if (equipmentSignature(targetRaw) !== equipmentSignature(editedRaw)) {
		throw new Error("Active equipment changed during inventory insertion");
	}
	const knowledgeSignature = (raw: Uint8Array): string =>
		JSON.stringify(
			readKnowledge(raw).map((record) => [
				record.key,
				record.level,
				record.learnedFieldTime,
				record.isNew,
			]),
		);
	if (knowledgeSignature(targetRaw) !== knowledgeSignature(editedRaw)) {
		throw new Error("Knowledge changed during donor equipment insertion");
	}

	const { bytes: output, verification } = await commitSave(
		{ original: targetDecoded.rawPayload, header: targetDecoded.header },
		"Encoded donor equipment insertion",
		editedRaw,
	);
	return [
		output,
		{
			edit: "insert_donor_equipment_into_inventory",
			donor_slot: options.donorSlot,
			inventory_key: inventoryKey,
			item_key: donor.itemKey,
			new_item_no: newItemNo,
			new_inventory_slot: newSlot,
			refinement: result.values._enchantLevel,
			socket_count: result.sockets.length,
			filled_sockets: result.sockets
				.filter((socket) => socket.itemKey !== null)
				.map((socket) => socket.itemKey),
			donor_dye_count: donor.dyes.length,
			dyes_removed: removedDyeCount,
			dyes_preserved: insertedDyes.length,
			inventory_count_before: beforeInventory.length,
			inventory_count_after: afterInventory.length,
			active_equipment_preserved: true,
			knowledge_preserved: true,
			schema_unchanged: true,
			...verification,
		},
	];
};
