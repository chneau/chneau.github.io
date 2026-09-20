/**
 * TypeScript port of `public/python/editor/catalog_equipment.py`.
 *
 * Constructs fresh equipment using the uploaded save's own PARC schema. It
 * never copies dyes, upgrades or special state.
 */

import { concatBytes, readU32, writeU16, writeU32 } from "./bytes";
import { decodeSave } from "./container";
import { type EquipmentCatalogEntry, equipmentCatalogTable } from "./data";
import { defined } from "./defined";
import { RUNTIME_RESTRICTED_EQUIPMENT } from "./donor-equipment-inserter";
import { type InventoryRecord, readInventory } from "./inventory-reader";
import {
	assertNonInventoryBlocksUnchanged,
	rebaseClonePointers,
	shiftExistingBlockPointers,
	unusedItemNo,
	writeListCount,
} from "./parc";
import {
	findInventoryCategories,
	findInventoryTocIndex,
	type ParcBlob,
	parseParcBlob,
	serializeParc,
	type TypeDef,
} from "./parc-serializer";
import { commitSave } from "./transaction";

let catalogPromise: Promise<Record<string, EquipmentCatalogEntry>> | undefined;

export const equipmentCatalog = (): Promise<
	Record<string, EquipmentCatalogEntry>
> => {
	catalogPromise ??= equipmentCatalogTable().then((data) => data.items);
	return catalogPromise;
};

const objectHeader = (
	kind: TypeDef,
	mask: Uint8Array,
	start: number,
): Uint8Array => {
	const header = new Uint8Array(2 + mask.length + 2 + 1 + 8 + 4);
	writeU16(header, 0, mask.length);
	header.set(mask, 2);
	writeU16(header, 2 + mask.length, kind.index);
	header[2 + mask.length + 2] = 0;
	header.fill(0xff, 2 + mask.length + 3, 2 + mask.length + 11);
	writeU32(header, header.length - 4, start + header.length);
	return header;
};

type BuildFreshRecordOptions = {
	start: number;
	key: number;
	itemNo: number;
	slot: number;
	refinement?: number;
	unlockedSockets?: number;
};

const buildFreshRecord = (
	parc: ParcBlob,
	options: BuildFreshRecordOptions,
): Uint8Array => {
	const refinement = options.refinement ?? 0;
	const unlockedSockets = options.unlockedSockets ?? 0;
	const types = new Map(parc.types.map((kind) => [kind.name, kind]));
	const kind = types.get("ItemSaveData");
	const socketKind = types.get("ItemSocketSaveData");
	if (!kind || !socketKind) {
		throw new Error("This save uses an unsupported equipment schema.");
	}
	const values = new Map<string, [number, number]>([
		["_saveVersion", [1, 4]],
		["_itemNo", [options.itemNo, 8]],
		["_itemKey", [options.key, 4]],
		["_slotNo", [options.slot, 2]],
		["_stackCount", [1, 8]],
		["_enchantLevel", [refinement, 2]],
		["_endurance", [65535, 2]],
		["_maxSocketCount", [5, 1]],
		["_validSocketCount", [unlockedSockets, 1]],
		["_transferredItemKey", [options.key, 4]],
		["_maxChargeUseableCount", [1, 4]],
		["_chargedUseableCount", [1, 8]],
		["_isNewMark", [1, 1]],
	]);
	const required = new Set([...values.keys(), "_socketSaveDataList"]);
	const fieldNames = new Set(kind.fields.map((field) => field.name));
	for (const name of required) {
		if (!fieldNames.has(name)) {
			throw new Error("This save uses an unsupported equipment schema.");
		}
	}
	const mask = new Uint8Array(Math.ceil(kind.fields.length / 8));
	kind.fields.forEach((field, index) => {
		if (required.has(field.name)) {
			mask[Math.floor(index / 8)] =
				(mask[Math.floor(index / 8)] ?? 0) | (1 << (index % 8));
		}
	});
	const parts: Uint8Array[] = [objectHeader(kind, mask, options.start)];
	let length = defined(parts[0], "record header").length;
	const payloadStart = length;

	const zeros4 = new Uint8Array(4);
	parts.push(zeros4);
	length += 4;

	for (const field of kind.fields) {
		const entry = values.get(field.name);
		if (entry) {
			const [value, size] = entry;
			if (field.metaKind !== 0 || field.metaSize !== size) {
				throw new Error(`Unsupported equipment field layout: ${field.name}`);
			}
			const buffer = new Uint8Array(size);
			let remaining = BigInt(value);
			for (let index = 0; index < size; index++) {
				buffer[index] = Number(remaining & 0xffn);
				remaining >>= 8n;
			}
			parts.push(buffer);
			length += size;
		} else if (field.name === "_socketSaveDataList") {
			if (field.metaKind !== 6) {
				throw new Error("Unsupported socket-list schema");
			}
			const header = new Uint8Array(1 + 4 + 13);
			header[0] = 0;
			writeU32(header, 1, 5);
			parts.push(header);
			length += 18;
			for (let socket = 0; socket < 5; socket++) {
				const socketMask = new Uint8Array(
					Math.ceil(socketKind.fields.length / 8),
				);
				const socketHeader = objectHeader(
					socketKind,
					socketMask,
					options.start + length,
				);
				const tail = new Uint8Array(4 + 4);
				writeU32(tail, 4, 4);
				parts.push(socketHeader, tail);
				length += socketHeader.length + tail.length;
			}
			parts.push(new Uint8Array([1, 1]));
			length += 2;
		}
	}
	const trailer = new Uint8Array(4);
	writeU32(trailer, 0, length - payloadStart);
	parts.push(trailer);
	return concatBytes(...parts);
};

const normalizedRecord = (
	raw: Uint8Array,
	record: InventoryRecord,
): Uint8Array => {
	const blob = raw.slice(record.recordStart, record.recordEnd);
	rebaseClonePointers(blob, record.recordStart, record.recordEnd, 0);
	return blob;
};

export const insertCatalogEquipment = async (
	sourceBytes: Uint8Array,
	options: { itemKey: number; inventoryKey?: number; refinement?: number },
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const definition = (await equipmentCatalog())[String(options.itemKey)];
	if (definition && !definition.characterEquipment) {
		throw new Error("This is not supported character equipment. Use Add Item.");
	}
	return insertCatalogRecord(sourceBytes, {
		itemKey: options.itemKey,
		inventoryKey: options.inventoryKey ?? 2,
		refinement: options.refinement ?? 0,
	});
};

export const insertCatalogItem = async (
	sourceBytes: Uint8Array,
	options: { itemKey: number; inventoryKey?: number },
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const definition = (await equipmentCatalog())[String(options.itemKey)];
	if (!definition || definition.characterEquipment) {
		throw new Error(
			"Choose an item from Add Item; character gear uses Equipment.",
		);
	}
	return insertCatalogRecord(sourceBytes, {
		itemKey: options.itemKey,
		inventoryKey: options.inventoryKey ?? 2,
		refinement: 0,
	});
};

const insertCatalogRecord = async (
	sourceBytes: Uint8Array,
	options: { itemKey: number; inventoryKey: number; refinement: number },
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const { itemKey, inventoryKey, refinement } = options;
	if (
		!Number.isInteger(itemKey) ||
		!Number.isInteger(inventoryKey) ||
		!Number.isInteger(refinement)
	) {
		throw new Error("Equipment, storage and refinement must be integers.");
	}
	if (refinement < 0 || refinement > 10) {
		throw new Error("Refinement must be between 0 and 10.");
	}
	const definition = (await equipmentCatalog())[String(itemKey)];
	if (!definition) {
		throw new Error("Choose equipment from the current-game catalog.");
	}
	if (!(definition.refinementLevels ?? []).includes(refinement)) {
		throw new Error(
			"This item does not support the requested refinement level.",
		);
	}
	const unlocked = definition.initialUnlockedSockets ?? 0;
	if (unlocked < 0 || unlocked > (definition.socketCap ?? 0)) {
		throw new Error("Invalid initial socket count in item data.");
	}
	if (itemKey in RUNTIME_RESTRICTED_EQUIPMENT) {
		throw new Error(
			defined(
				RUNTIME_RESTRICTED_EQUIPMENT[itemKey],
				"runtime restriction note",
			),
		);
	}
	if (definition.blockedInGameData) {
		throw new Error(
			"This equipment is marked unavailable in the installed game data.",
		);
	}

	const decoded = await decodeSave(sourceBytes);
	const raw = decoded.rawPayload;
	const before = readInventory(raw);
	if (
		before.some(
			(record) =>
				record.inventoryKey === inventoryKey && record.itemKey === itemKey,
		)
	) {
		throw new Error(
			"This equipment already exists in the selected storage. Edit that copy instead.",
		);
	}
	const parc = parseParcBlob(raw);
	const toc = findInventoryTocIndex(parc);
	if (toc === undefined) throw new Error("Inventory block is missing.");
	const entry = defined(parc.tocEntries[toc], "inventory TOC entry");
	const category = findInventoryCategories(parc, toc).find(
		(row) => row.inventoryKey === inventoryKey,
	);
	if (!category?.hasItemList) {
		throw new Error("This storage does not support item insertion.");
	}
	const used = new Set(
		before
			.filter((record) => record.inventoryKey === inventoryKey)
			.map((record) => record.slotNo),
	);
	let slot: number | null = null;
	for (let candidate = 0; candidate < 65536; candidate++) {
		if (!used.has(candidate)) {
			slot = candidate;
			break;
		}
	}
	if (slot === null) throw new Error("This inventory has no free save slots.");
	const itemNo = unusedItemNo(raw, before);
	const position = category.itemsEndAbs;
	const recordBytes = buildFreshRecord(parc, {
		start: position,
		key: itemKey,
		itemNo,
		slot,
		refinement,
		unlockedSockets: unlocked,
	});
	const oldBlock = parc.blockRaw.get(toc) ?? new Uint8Array();
	const relative = position - entry.dataOffset;
	const newBlock = concatBytes(
		oldBlock.slice(0, relative),
		recordBytes,
		oldBlock.slice(relative),
	);
	const delta = recordBytes.length;
	shiftExistingBlockPointers(
		oldBlock,
		newBlock,
		entry.dataOffset,
		position,
		delta,
	);
	writeListCount(
		newBlock,
		entry.dataOffset,
		category.itemListAbs,
		category.itemCount + 1,
	);
	const trailer = category.elemEndAbs - entry.dataOffset - 4 + delta;
	writeU32(newBlock, trailer, readU32(newBlock, trailer) + delta);
	parc.modifiedBlocks.set(toc, newBlock);
	const editedRaw = serializeParc(parc);
	const after = readInventory(editedRaw);
	const inserted = after.filter(
		(record) =>
			record.inventoryKey === inventoryKey &&
			record.slotNo === slot &&
			record.itemNo === itemNo,
	);
	if (after.length !== before.length + 1 || inserted.length !== 1) {
		throw new Error("Inserted equipment did not reparse exactly once.");
	}
	const insertedRecord = defined(inserted[0], "inserted equipment record");
	if (
		insertedRecord.itemKey !== itemKey ||
		insertedRecord.stackCount !== 1 ||
		insertedRecord.values._transferredItemKey !== itemKey ||
		insertedRecord.values._enchantLevel !== refinement
	) {
		throw new Error(
			"Inserted equipment identity or refinement differs from the request.",
		);
	}
	if (
		insertedRecord.sockets.length !== 5 ||
		insertedRecord.sockets.some((socket) => socket.itemKey) ||
		insertedRecord.values._validSocketCount !== unlocked
	) {
		throw new Error(
			"Fresh item socket records differ from the catalog defaults.",
		);
	}
	const oldRecords = before.map((record) => [
		record.inventoryKey,
		record.slotNo,
		normalizedRecord(raw, record),
	]);
	const retainedRecords = after
		.filter((record) => record !== insertedRecord)
		.map((record) => [
			record.inventoryKey,
			record.slotNo,
			normalizedRecord(editedRaw, record),
		]);
	if (JSON.stringify(retainedRecords) !== JSON.stringify(oldRecords)) {
		throw new Error(
			"Existing inventory data changed during equipment insertion.",
		);
	}
	assertNonInventoryBlocksUnchanged(raw, editedRaw);
	const { bytes: output, verification } = await commitSave(
		{ original: raw, header: decoded.header },
		"Equipment output",
		editedRaw,
	);
	return [
		output,
		{
			edit: "insert_catalog_equipment",
			item_key: itemKey,
			item_name: definition.name,
			inventory_key: inventoryKey,
			new_slot: slot,
			new_item_no: itemNo,
			refinement,
			preexisting_records_preserved: true,
			active_equipment_preserved: true,
			knowledge_preserved: true,
			catalog_wide_in_game_verified: false,
			...verification,
		},
	];
};
