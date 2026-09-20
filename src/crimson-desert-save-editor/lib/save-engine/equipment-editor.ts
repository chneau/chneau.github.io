/**
 * TypeScript port of `public/python/editor/equipment_editor.py`.
 */

import { requireCompatibleGear } from "./abyss-gear-compatibility";
import {
	concatBytes,
	readU16,
	readU32,
	writeI64,
	writeU16,
	writeU32,
} from "./bytes";
import { decodeSave } from "./container";
import { equipmentCatalogTable } from "./data";
import { defined } from "./defined";
import {
	findInventoryRecord,
	type InventoryRecord,
	type InventoryRecordTarget,
	readInventory,
} from "./inventory-reader";
import {
	assertNonInventoryBlocksUnchanged,
	listLayout,
	locator,
	serializeWithPreservedRoots,
	shiftExistingBlockPointers,
} from "./parc";
import {
	BlockParser,
	findInventoryCategories,
	findInventoryTocIndex,
	parseParcBlob,
} from "./parc-serializer";
import { assertOnlyChanged } from "./raw-diff";
import { defaultSocketCaps } from "./socket-caps";
import { commitSave } from "./transaction";

/** The record an equipment edit addresses; the same shape, named for callers. */
export type EquipmentTarget = InventoryRecordTarget;

/**
 * One field's worth of an equipment record, written as raw payload in and raw
 * payload out, so several fields can share a single decode and commit.
 */
type AppliedPayload = {
	payload: Uint8Array;
	before: InventoryRecord;
	beforeRecords: InventoryRecord[];
	details: Record<string, unknown>;
};

const recordSignature = (record: InventoryRecord): string => {
	const scalars = Object.entries(record.values)
		.filter(([, value]) => typeof value !== "object" || value === null)
		.sort(([a], [b]) => a.localeCompare(b));
	return JSON.stringify([
		record.inventoryKey,
		record.itemNo,
		record.itemKey,
		record.slotNo,
		record.stackCount,
		scalars,
		record.sockets.map((socket) => [socket.currentEndurance, socket.itemKey]),
	]);
};

const refinementLevels = async (itemKey: number): Promise<number[]> => {
	const catalog = await equipmentCatalogTable();
	return catalog.items[String(itemKey)]?.refinementLevels ?? [];
};

const applyEnchantLevel = async (
	raw: Uint8Array,
	target: EquipmentTarget,
	expectedLevel: number,
	newLevel: number,
): Promise<AppliedPayload> => {
	if (newLevel < 0 || newLevel > 10) {
		throw new Error("Safe-mode enchant level must be between 0 and 10");
	}
	if (!(await refinementLevels(target.itemKey)).includes(newLevel)) {
		throw new Error(
			"This item does not support the requested refinement level.",
		);
	}
	const beforeRecords = readInventory(raw);
	const before = findInventoryRecord(beforeRecords, target);
	const oldLevel = Number(before.values._enchantLevel ?? 0);
	if (oldLevel !== expectedLevel) {
		throw new Error(
			`Expected enchant level ${expectedLevel}, found ${oldLevel}`,
		);
	}
	if (newLevel === oldLevel) {
		throw new Error("The requested refinement is already present.");
	}

	let payload: Uint8Array;
	let changed: number[] = [];
	if ("_enchantLevel" in before.fieldOffsets) {
		const offset = before.fieldOffsets._enchantLevel ?? 0;
		payload = raw.slice();
		writeU16(payload, offset, newLevel);
		changed = assertOnlyChanged(
			raw,
			payload,
			[{ start: offset, size: 2 }],
			"Refinement edit",
		);
	} else {
		// A naturally acquired level-zero item may omit the default-valued field.
		const parc = parseParcBlob(raw);
		const [kindIndex, mask] = locator(
			raw,
			before.recordStart,
			parc.typeByIndex,
		);
		const kind = parc.typeByIndex.get(kindIndex);
		if (!kind) throw new Error("Item type was not found");
		const fieldIndex = kind.fields.findIndex(
			(field) => field.name === "_enchantLevel",
		);
		const field = kind.fields[fieldIndex];
		const maskByteSet =
			(((mask[Math.floor(fieldIndex / 8)] ?? 0) >> (fieldIndex % 8)) & 1) === 1;
		if (field?.metaKind !== 0 || field.metaSize !== 2 || maskByteSet) {
			throw new Error("Unsupported missing-refinement field layout.");
		}
		const following = kind.fields
			.slice(fieldIndex + 1)
			.map((candidate) => before.fieldOffsets[candidate.name])
			.filter((value): value is number => value !== undefined);
		if (following.length === 0) {
			throw new Error("Could not locate the field after refinement.");
		}
		const insertAbs = Math.min(...following);
		const toc = findInventoryTocIndex(parc);
		if (toc === undefined) {
			throw new Error("InventorySaveData block was not found");
		}
		const entry = defined(parc.tocEntries[toc], "inventory TOC entry");
		const category = findInventoryCategories(parc, toc).find(
			(row) => row.inventoryKey === target.inventoryKey,
		);
		if (!category) {
			throw new Error("Could not locate the target inventory category");
		}
		const oldBlock = parc.blockRaw.get(toc) ?? new Uint8Array();
		const relative = insertAbs - entry.dataOffset;
		const newBlock = concatBytes(
			oldBlock.slice(0, relative),
			u16(newLevel),
			oldBlock.slice(relative),
		);
		const maskCount = readU16(raw, before.recordStart);
		if (
			maskCount <= 0 ||
			maskCount > 16 ||
			Math.floor(fieldIndex / 8) >= maskCount
		) {
			throw new Error("Unsupported equipment presence mask.");
		}
		const maskOffset =
			before.recordStart + 2 + Math.floor(fieldIndex / 8) - entry.dataOffset;
		newBlock[maskOffset] =
			(newBlock[maskOffset] ?? 0) | (1 << (fieldIndex % 8));
		shiftExistingBlockPointers(
			oldBlock,
			newBlock,
			entry.dataOffset,
			insertAbs,
			2,
		);
		for (const trailer of [before.recordEnd - 4, category.elemEndAbs - 4]) {
			const relativeTrailer = trailer + 2 - entry.dataOffset;
			writeU32(
				newBlock,
				relativeTrailer,
				readU32(newBlock, relativeTrailer) + 2,
			);
		}
		parc.modifiedBlocks.set(toc, newBlock);
		payload = serializeWithPreservedRoots(parc);
		assertNonInventoryBlocksUnchanged(raw, payload);
	}

	return {
		payload,
		before,
		beforeRecords,
		details: {
			old_level: oldLevel,
			raw_changed_byte_offsets: changed,
			inserted_missing_refinement_field: !(
				"_enchantLevel" in before.fieldOffsets
			),
		},
	};
};

export const editEnchantLevel = async (
	sourceBytes: Uint8Array,
	target: EquipmentTarget,
	expectedLevel: number,
	newLevel: number,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const decoded = await decodeSave(sourceBytes);
	const { payload, before, beforeRecords, details } = await applyEnchantLevel(
		decoded.rawPayload,
		target,
		expectedLevel,
		newLevel,
	);
	const {
		bytes: outputBytes,
		reopenedPayload,
		verification,
	} = await commitSave(
		{ original: decoded.rawPayload, header: decoded.header },
		"Encoded edit",
		payload,
	);
	const afterRecords = readInventory(reopenedPayload);
	const after = findInventoryRecord(afterRecords, target);
	if (Number(after.values._enchantLevel ?? -1) !== newLevel) {
		throw new Error(
			"Edited output did not reparse with the requested enchant level",
		);
	}
	if (afterRecords.length !== beforeRecords.length) {
		throw new Error("Inventory record count changed during scalar edit");
	}
	const oldOthers = new Map(
		beforeRecords
			.filter((record) => record.itemNo !== before.itemNo)
			.map((record) => [
				`${record.inventoryKey}:${record.itemNo}`,
				recordSignature(record),
			]),
	);
	const newOthers = new Map(
		afterRecords
			.filter((record) => record.itemNo !== before.itemNo)
			.map((record) => [
				`${record.inventoryKey}:${record.itemNo}`,
				recordSignature(record),
			]),
	);
	if (!mapsEqual(oldOthers, newOthers)) {
		throw new Error("Other inventory records changed during refinement.");
	}
	const scalarPairs = (record: InventoryRecord): string =>
		JSON.stringify(
			Object.entries(record.values)
				.filter(
					([name, value]) =>
						name !== "_enchantLevel" &&
						(typeof value !== "object" || value === null),
				)
				.sort(([a], [b]) => a.localeCompare(b)),
		);
	if (scalarPairs(before) !== scalarPairs(after)) {
		throw new Error("Other equipment values changed during refinement.");
	}
	if (
		JSON.stringify(
			before.sockets.map((s) => [s.itemKey, s.currentEndurance]),
		) !==
		JSON.stringify(after.sockets.map((s) => [s.itemKey, s.currentEndurance]))
	) {
		throw new Error("Socket contents changed during refinement.");
	}

	return [
		outputBytes,
		{
			edit: "enchant_level",
			inventory_key: target.inventoryKey,
			slot: target.slotNo,
			item_key: target.itemKey,
			new_level: newLevel,
			...details,
			...verification,
			inventory_reparsed: true,
		},
	];
};

type SocketUnlockOptions = {
	allowOvercapExperimental?: boolean;
};

const applyValidSocketCount = async (
	raw: Uint8Array,
	target: EquipmentTarget,
	expectedCount: number,
	newCount: number,
	options: SocketUnlockOptions = {},
): Promise<AppliedPayload> => {
	const beforeRaw = raw;
	const beforeRecords = readInventory(beforeRaw);
	const before = findInventoryRecord(beforeRecords, target);
	const hasValidCount = "_validSocketCount" in before.fieldOffsets;
	const oldCount = Number(before.values._validSocketCount ?? 0);
	const serializedCapacity = Number(
		before.values._maxSocketCount ?? before.sockets.length,
	);
	const caps = await defaultSocketCaps();
	const capInfo = caps.require(before.itemKey);
	const gameplayCap = capInfo.maxSockets;
	if (oldCount !== expectedCount) {
		throw new Error(
			`Expected ${expectedCount} unlocked sockets, found ${oldCount}`,
		);
	}
	const overGameplayCap = newCount > gameplayCap;
	if (overGameplayCap) {
		if (!options.allowOvercapExperimental) {
			throw new Error(
				`Requested count ${newCount} exceeds this item's verified gameplay maximum of ${gameplayCap}`,
			);
		}
		if (oldCount !== gameplayCap || newCount !== gameplayCap + 1) {
			throw new Error(
				"Experimental over-cap testing only permits one step from the verified gameplay maximum",
			);
		}
	} else if (oldCount >= gameplayCap) {
		throw new Error(
			`This item is already at its verified gameplay maximum of ${gameplayCap} sockets`,
		);
	} else if (!(oldCount < newCount && newCount <= gameplayCap)) {
		throw new Error(
			`Safe socket unlocking must increase the count within ${
				oldCount + 1
			}..${gameplayCap}; this item's verified gameplay maximum is ${gameplayCap}`,
		);
	}
	if (newCount > before.sockets.length || newCount > serializedCapacity) {
		throw new Error("Unlocked count cannot exceed serialized socket records");
	}

	let payload: Uint8Array;
	let changed: number[] = [];
	let structuralMode: string;
	let rawSizeDelta: number;

	if (hasValidCount) {
		const offset = before.fieldOffsets._validSocketCount ?? 0;
		const edited = beforeRaw.slice();
		edited[offset] = newCount & 0xff;
		changed = assertOnlyChanged(
			beforeRaw,
			edited,
			[{ start: offset, size: 1 }],
			"Socket-count edit",
		);
		payload = edited;
		structuralMode = "scalar_existing_field";
		rawSizeDelta = 0;
	} else {
		if (oldCount !== 0 || newCount !== 1) {
			throw new Error(
				"A missing count field may only be initialized from 0 to 1",
			);
		}
		if (!("_socketSaveDataList" in before.fieldOffsets)) {
			throw new Error(
				"Cannot locate the socket list following the missing count",
			);
		}
		const parc = parseParcBlob(beforeRaw);
		const [itemTypeIndex, itemMask] = locator(
			beforeRaw,
			before.recordStart,
			parc.typeByIndex,
		);
		const itemType = parc.typeByIndex.get(itemTypeIndex);
		if (!itemType) throw new Error("Item type was not found");
		const validIndex = itemType.fields.findIndex(
			(field) => field.name === "_validSocketCount",
		);
		const socketIndex = itemType.fields.findIndex(
			(field) => field.name === "_socketSaveDataList",
		);
		if (socketIndex !== validIndex + 1) {
			throw new Error("Unexpected ItemSaveData socket field order");
		}
		if (
			(((itemMask[Math.floor(validIndex / 8)] ?? 0) >> (validIndex % 8)) &
				1) ===
			1
		) {
			throw new Error(
				"Count field presence bit is set despite the field being absent",
			);
		}
		if (
			!(((itemMask[Math.floor(socketIndex / 8)] ?? 0) >> (socketIndex % 8)) & 1)
		) {
			throw new Error("Socket list presence bit is not set");
		}
		const inventoryToc = findInventoryTocIndex(parc);
		if (inventoryToc === undefined) {
			throw new Error("InventorySaveData block was not found");
		}
		const inventoryEntry = defined(
			parc.tocEntries[inventoryToc],
			"inventory TOC entry",
		);
		const category = findInventoryCategories(parc, inventoryToc).find(
			(row) =>
				row.inventoryKey === target.inventoryKey &&
				row.itemListAbs < before.recordStart &&
				before.recordStart < row.itemsEndAbs,
		);
		if (!category) {
			throw new Error("Could not locate the target inventory category");
		}
		const insertAbs = before.fieldOffsets._socketSaveDataList ?? 0;
		const oldBlock = parc.blockRaw.get(inventoryToc) ?? new Uint8Array();
		const insertRel = insertAbs - inventoryEntry.dataOffset;
		const newBlock = concatBytes(
			oldBlock.slice(0, insertRel),
			new Uint8Array([newCount & 0xff]),
			oldBlock.slice(insertRel),
		);
		const maskCount = readU16(beforeRaw, before.recordStart);
		if (
			maskCount <= 0 ||
			maskCount > 16 ||
			Math.floor(validIndex / 8) >= maskCount
		) {
			throw new Error(
				"ItemSaveData does not use the expected full presence mask",
			);
		}
		const maskRel =
			before.recordStart +
			2 +
			Math.floor(validIndex / 8) -
			inventoryEntry.dataOffset;
		newBlock[maskRel] = (newBlock[maskRel] ?? 0) | (1 << (validIndex % 8));

		rawSizeDelta = 1;
		shiftExistingBlockPointers(
			oldBlock,
			newBlock,
			inventoryEntry.dataOffset,
			insertAbs,
			rawSizeDelta,
		);
		for (const oldTrailer of [before.recordEnd - 4, category.elemEndAbs - 4]) {
			const newTrailerRel =
				oldTrailer + rawSizeDelta - inventoryEntry.dataOffset;
			writeU32(
				newBlock,
				newTrailerRel,
				readU32(newBlock, newTrailerRel) + rawSizeDelta,
			);
		}
		parc.modifiedBlocks.set(inventoryToc, newBlock);
		payload = serializeWithPreservedRoots(parc);
		if (payload.length !== beforeRaw.length + rawSizeDelta) {
			throw new Error(
				"First-socket field insertion must grow the save by one byte",
			);
		}
		structuralMode = "insert_missing_field";
	}
	if (rawSizeDelta) {
		assertNonInventoryBlocksUnchanged(beforeRaw, payload);
	}

	return {
		payload,
		before,
		beforeRecords,
		details: {
			old_valid_socket_count: oldCount,
			new_valid_socket_count: newCount,
			gameplay_socket_cap: gameplayCap,
			gameplay_socket_cap_source: capInfo.source,
			gameplay_socket_cap_confidence: capInfo.confidence,
			gameplay_socket_cap_tested_build_id: capInfo.testedBuildId,
			serialized_socket_capacity: serializedCapacity,
			over_gameplay_cap: overGameplayCap,
			structural_mode: structuralMode,
			raw_size_delta: rawSizeDelta,
			raw_changed_byte_offsets: changed,
		},
	};
};

export const editValidSocketCount = async (
	sourceBytes: Uint8Array,
	target: EquipmentTarget,
	expectedCount: number,
	newCount: number,
	options: SocketUnlockOptions = {},
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const decoded = await decodeSave(sourceBytes);
	const { payload, before, beforeRecords, details } =
		await applyValidSocketCount(
			decoded.rawPayload,
			target,
			expectedCount,
			newCount,
			options,
		);
	const {
		bytes: outputBytes,
		reopenedPayload,
		verification,
	} = await commitSave(
		{ original: decoded.rawPayload, header: decoded.header },
		"Encoded edit",
		payload,
	);
	const afterRecords = readInventory(reopenedPayload);
	const after = findInventoryRecord(afterRecords, target);
	if (Number(after.values._validSocketCount ?? -1) !== newCount) {
		throw new Error("Output did not reparse with the requested unlocked count");
	}
	if (
		JSON.stringify(
			after.sockets.map((s) => [s.currentEndurance, s.itemKey]),
		) !==
		JSON.stringify(before.sockets.map((s) => [s.currentEndurance, s.itemKey]))
	) {
		throw new Error("Socket contents changed while unlocking socket positions");
	}
	if (afterRecords.length !== beforeRecords.length) {
		throw new Error("Inventory record count changed during socket unlock");
	}

	return [
		outputBytes,
		{
			edit: "valid_socket_count",
			inventory_key: target.inventoryKey,
			slot: target.slotNo,
			item_key: target.itemKey,
			...details,
			socket_contents_preserved: true,
			...verification,
			inventory_reparsed: true,
		},
	];
};

const applySocketItem = async (
	raw: Uint8Array,
	target: EquipmentTarget,
	socketIndex: number,
	expectedSocketItemKey: number,
	newSocketItemKey: number,
): Promise<AppliedPayload> => {
	await requireCompatibleGear(target.itemKey, newSocketItemKey);
	const beforeRecords = readInventory(raw);
	const before = findInventoryRecord(beforeRecords, target);
	const caps = await defaultSocketCaps();
	const capInfo = caps.require(before.itemKey);
	if (socketIndex >= capInfo.maxSockets) {
		throw new Error(
			`Socket index ${socketIndex} exceeds this item's gameplay maximum of ${capInfo.maxSockets}`,
		);
	}
	if (socketIndex < 0 || socketIndex >= before.sockets.length) {
		throw new Error(
			`Socket index ${socketIndex} is outside this item's ${before.sockets.length} slots`,
		);
	}
	const socket = defined(before.sockets[socketIndex], "socket record");
	if (socket.itemKey !== expectedSocketItemKey) {
		throw new Error(
			`Expected socket item ${expectedSocketItemKey}, found ${socket.itemKey}`,
		);
	}
	if (!("_itemKey" in socket.fieldOffsets)) {
		throw new Error(
			"Selected socket is empty; safe replacement requires a filled socket",
		);
	}
	if (
		before.sockets.some(
			(other, index) =>
				index !== socketIndex && other.itemKey === newSocketItemKey,
		)
	) {
		throw new Error("Safe mode refuses to create a duplicate socket item");
	}

	const offset = socket.fieldOffsets._itemKey ?? 0;
	const payload = raw.slice();
	writeU32(payload, offset, newSocketItemKey);
	const changed = assertOnlyChanged(
		raw,
		payload,
		[{ start: offset, size: 4 }],
		"Socket item edit",
	);

	return {
		payload,
		before,
		beforeRecords,
		details: {
			socket_index: socketIndex,
			old_socket_item_key: expectedSocketItemKey,
			new_socket_item_key: newSocketItemKey,
			gameplay_socket_cap: capInfo.maxSockets,
			gameplay_socket_cap_source: capInfo.source,
			raw_changed_byte_offsets: changed,
		},
	};
};

export const replaceSocketItem = async (
	sourceBytes: Uint8Array,
	target: EquipmentTarget,
	socketIndex: number,
	expectedSocketItemKey: number,
	newSocketItemKey: number,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const decoded = await decodeSave(sourceBytes);
	const { payload, beforeRecords, details } = await applySocketItem(
		decoded.rawPayload,
		target,
		socketIndex,
		expectedSocketItemKey,
		newSocketItemKey,
	);
	const {
		bytes: outputBytes,
		reopenedPayload,
		verification,
	} = await commitSave(
		{ original: decoded.rawPayload, header: decoded.header },
		"Encoded edit",
		payload,
	);
	const afterRecords = readInventory(reopenedPayload);
	const after = findInventoryRecord(afterRecords, target);
	if (
		defined(after.sockets[socketIndex], "socket record").itemKey !==
		newSocketItemKey
	) {
		throw new Error(
			"Edited output did not reparse with the requested socket item",
		);
	}
	if (afterRecords.length !== beforeRecords.length) {
		throw new Error("Inventory record count changed during socket replacement");
	}
	return [
		outputBytes,
		{
			edit: "socket_item",
			inventory_key: target.inventoryKey,
			slot: target.slotNo,
			item_key: target.itemKey,
			...details,
			...verification,
			inventory_reparsed: true,
		},
	];
};

const applyFillEmptySocket = async (
	raw: Uint8Array,
	target: EquipmentTarget,
	socketIndex: number,
	newSocketItemKey: number,
	options: { currentEndurance?: number } = {},
): Promise<AppliedPayload> => {
	const currentEndurance = options.currentEndurance ?? 0xffff;
	await requireCompatibleGear(target.itemKey, newSocketItemKey);
	if (currentEndurance < 0 || currentEndurance > 0xffff) {
		throw new Error("Socket endurance must fit in an unsigned 16-bit field");
	}
	const beforeRaw = raw;
	const beforeRecords = readInventory(beforeRaw);
	const before = findInventoryRecord(beforeRecords, target);
	const caps = await defaultSocketCaps();
	const capInfo = caps.require(before.itemKey);
	if (socketIndex >= capInfo.maxSockets) {
		throw new Error(
			`Socket index ${socketIndex} exceeds this item's gameplay maximum of ${capInfo.maxSockets}`,
		);
	}
	if (socketIndex < 0 || socketIndex >= before.sockets.length) {
		throw new Error(
			`Socket index ${socketIndex} is outside this item's ${before.sockets.length} slots`,
		);
	}
	const validSocketCount = before.values._validSocketCount;
	if (typeof validSocketCount !== "number" || socketIndex >= validSocketCount) {
		throw new Error("Safe mode refuses to fill a locked socket position");
	}
	if (defined(before.sockets[socketIndex], "socket record").itemKey !== null) {
		throw new Error("Selected socket is already filled");
	}
	if (before.sockets.some((socket) => socket.itemKey === newSocketItemKey)) {
		throw new Error("Safe mode refuses to create a duplicate socket item");
	}

	const socketList = before.values._socketSaveDataList as
		| { kind: string; raw: Uint8Array }
		| undefined;
	if (!socketList || !(socketList.raw instanceof Uint8Array)) {
		throw new Error("Unable to locate the serialized socket list");
	}
	const socketListStart = before.fieldOffsets._socketSaveDataList ?? 0;
	const socketListEnd = socketListStart + socketList.raw.length;

	const parc = parseParcBlob(beforeRaw);
	const parser = new BlockParser(parc);
	const [socketCount, startCursor] = listLayout(
		beforeRaw,
		socketListStart,
		socketListEnd,
	);
	if (socketCount !== before.sockets.length) {
		throw new Error("Serialized and parsed socket counts disagree");
	}
	let cursor = startCursor;
	let selectedStart: number | null = null;
	let selectedEnd: number | null = null;
	let selectedTypeIndex: number | null = null;
	for (let index = 0; index < socketCount; index++) {
		const elementEnd = parser.parseListElement(cursor, socketListEnd);
		const [typeIndex, mask, payload] = locator(
			beforeRaw,
			cursor,
			parc.typeByIndex,
		);
		if (parc.typeByIndex.get(typeIndex)?.name !== "ItemSocketSaveData") {
			throw new Error("Socket list contains an unexpected element type");
		}
		if (index === socketIndex) {
			if (
				mask.length !== 1 ||
				(mask[0] ?? 0) !== 0 ||
				payload !== cursor + 18
			) {
				throw new Error("Selected empty socket has an unexpected encoding");
			}
			selectedStart = cursor;
			selectedEnd = elementEnd;
			selectedTypeIndex = typeIndex;
		}
		cursor = elementEnd;
	}
	if (
		selectedStart === null ||
		selectedEnd === null ||
		selectedTypeIndex === null
	) {
		throw new Error("Selected socket element was not found");
	}
	if (selectedEnd - selectedStart !== 26) {
		throw new Error("Current empty-socket record is not 26 bytes");
	}

	const filledElement = new Uint8Array(32);
	writeU16(filledElement, 0, 1);
	filledElement[2] = 3;
	writeU16(filledElement, 3, selectedTypeIndex);
	writeI64(filledElement, 6, 0xffffffffffffffffn);
	writeU32(filledElement, 14, selectedStart + 18);
	writeU16(filledElement, 22, currentEndurance);
	writeU32(filledElement, 24, newSocketItemKey);
	writeU32(filledElement, 28, 10);

	const inventoryToc = findInventoryTocIndex(parc);
	if (inventoryToc === undefined) {
		throw new Error("InventorySaveData block was not found");
	}
	const inventoryEntry = defined(
		parc.tocEntries[inventoryToc],
		"inventory TOC entry",
	);
	const category = findInventoryCategories(parc, inventoryToc).find(
		(row) =>
			row.inventoryKey === target.inventoryKey &&
			row.itemListAbs < before.recordStart &&
			before.recordStart < row.itemsEndAbs,
	);
	if (!category) {
		throw new Error("Could not locate the target inventory category");
	}

	const oldBlock = parc.blockRaw.get(inventoryToc) ?? new Uint8Array();
	const startRel = selectedStart - inventoryEntry.dataOffset;
	const endRel = selectedEnd - inventoryEntry.dataOffset;
	const newBlock = concatBytes(
		oldBlock.slice(0, startRel),
		filledElement,
		oldBlock.slice(endRel),
	);
	const delta = filledElement.length - (selectedEnd - selectedStart);
	shiftExistingBlockPointers(
		oldBlock,
		newBlock,
		inventoryEntry.dataOffset,
		selectedEnd,
		delta,
	);
	for (const oldTrailer of [before.recordEnd - 4, category.elemEndAbs - 4]) {
		const newTrailerRel = oldTrailer + delta - inventoryEntry.dataOffset;
		writeU32(newBlock, newTrailerRel, readU32(newBlock, newTrailerRel) + delta);
	}

	parc.modifiedBlocks.set(inventoryToc, newBlock);
	const payload = serializeWithPreservedRoots(parc);
	if (delta !== 6 || payload.length !== beforeRaw.length + 6) {
		throw new Error(
			"An empty-to-filled socket conversion must grow by six bytes",
		);
	}

	const filledRecords = readInventory(payload);
	const filled = findInventoryRecord(filledRecords, target);
	if (
		defined(filled.sockets[socketIndex], "socket record").itemKey !==
		newSocketItemKey
	) {
		throw new Error(
			"Filled socket did not reparse with the requested Abyss Gear",
		);
	}
	if (
		defined(filled.sockets[socketIndex], "socket record").currentEndurance !==
		currentEndurance
	) {
		throw new Error("Filled socket endurance did not reparse correctly");
	}
	if (filled.values._validSocketCount !== validSocketCount) {
		throw new Error("Filling a socket changed its unlocked-socket count");
	}
	assertNonInventoryBlocksUnchanged(beforeRaw, payload);

	return {
		payload,
		before,
		beforeRecords,
		details: {
			socket_index: socketIndex,
			new_socket_item_key: newSocketItemKey,
			gameplay_socket_cap: capInfo.maxSockets,
			gameplay_socket_cap_source: capInfo.source,
			valid_socket_count_preserved: validSocketCount,
			socket_count_preserved: filled.sockets.length,
			raw_size_before: beforeRaw.length,
			raw_size_after: payload.length,
			raw_size_delta: delta,
			structural_conversion: "26-byte empty socket to 32-byte filled socket",
		},
	};
};

export const fillEmptySocket = async (
	sourceBytes: Uint8Array,
	target: EquipmentTarget,
	socketIndex: number,
	newSocketItemKey: number,
	options: { currentEndurance?: number } = {},
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const decoded = await decodeSave(sourceBytes);
	const { payload, beforeRecords, details } = await applyFillEmptySocket(
		decoded.rawPayload,
		target,
		socketIndex,
		newSocketItemKey,
		options,
	);
	const {
		bytes: outputBytes,
		reopenedPayload,
		verification,
	} = await commitSave(
		{ original: decoded.rawPayload, header: decoded.header },
		"Encoded edit",
		payload,
	);
	const afterRecords = readInventory(reopenedPayload);
	const after = findInventoryRecord(afterRecords, target);
	if (
		defined(after.sockets[socketIndex], "socket record").itemKey !==
		newSocketItemKey
	) {
		throw new Error(
			"Filled socket did not reopen with the requested Abyss Gear",
		);
	}
	if (afterRecords.length !== beforeRecords.length) {
		throw new Error("Inventory record count changed while filling a socket");
	}
	return [
		outputBytes,
		{
			edit: "fill_empty_socket",
			inventory_key: target.inventoryKey,
			slot: target.slotNo,
			item_key: target.itemKey,
			...details,
			other_inventory_preserved: true,
			equipped_loadout_preserved: true,
			knowledge_preserved: true,
			non_inventory_blocks_preserved: true,
			...verification,
			inventory_reparsed: true,
		},
	];
};

/** One equipment record's requested state, as a caller states it. */
type EquipmentDesiredState = {
	refinement: number;
	unlockedSockets: number;
	socketItems: Array<number | null>;
};

/**
 * The one equipment write: a whole record's desired state in a single
 * transaction. Refinement, socket unlocks and socket contents are written by
 * the applier that owns each field's guards, but they share one decode, one
 * commit and one reopen, so the save is re-encoded exactly once.
 */
export const setEquipment = async (
	sourceBytes: Uint8Array,
	target: EquipmentTarget,
	desired: EquipmentDesiredState,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	if (desired.refinement < 0 || desired.refinement > 10) {
		throw new Error("Refinement must be between 0 and 10");
	}
	const decoded = await decodeSave(sourceBytes);
	const original = decoded.rawPayload;
	const beforeRecords = readInventory(original);
	const before = findInventoryRecord(beforeRecords, target);
	const oldLevel = Number(before.values._enchantLevel ?? 0);
	const oldUnlocked = Number(before.values._validSocketCount ?? 0);
	if (desired.unlockedSockets < oldUnlocked) {
		throw new Error("Removing or relocking sockets is not supported.");
	}
	const wanted = desired.socketItems;
	const beforeSockets = before.sockets.map((socket) => socket.itemKey);
	for (let index = 0; index < wanted.length; index++) {
		const next = wanted[index] ?? null;
		const current = beforeSockets[index] ?? null;
		if (next === current) continue;
		if (next === null) {
			throw new Error(
				"Removing Abyss Gear is not supported; choose a replacement.",
			);
		}
		if (index >= desired.unlockedSockets) {
			throw new Error("Unlock the socket before filling it.");
		}
	}

	let payload = original;
	const changes: Array<Record<string, unknown>> = [];
	if (desired.refinement !== oldLevel) {
		const applied = await applyEnchantLevel(
			payload,
			target,
			oldLevel,
			desired.refinement,
		);
		payload = applied.payload;
		changes.push({ edit: "enchant_level", ...applied.details });
	}
	if (desired.unlockedSockets !== oldUnlocked) {
		const applied = await applyValidSocketCount(
			payload,
			target,
			oldUnlocked,
			desired.unlockedSockets,
		);
		payload = applied.payload;
		changes.push({ edit: "valid_socket_count", ...applied.details });
	}
	for (let index = 0; index < wanted.length; index++) {
		const next = wanted[index] ?? null;
		const current = beforeSockets[index] ?? null;
		if (next === null || next === current) continue;
		const applied =
			current === null
				? await applyFillEmptySocket(payload, target, index, next)
				: await applySocketItem(payload, target, index, current, next);
		payload = applied.payload;
		changes.push({
			edit: current === null ? "fill_empty_socket" : "socket_item",
			...applied.details,
		});
	}
	const identity = {
		edit: "equipment",
		inventory_key: target.inventoryKey,
		slot: target.slotNo,
		item_key: target.itemKey,
		refinement: desired.refinement,
		unlocked_sockets: desired.unlockedSockets,
		socket_items: wanted,
	};
	if (!changes.length) {
		return [sourceBytes, { ...identity, change_count: 0, changes: [] }];
	}

	const {
		bytes: outputBytes,
		reopenedPayload,
		verification,
	} = await commitSave(
		{ original, header: decoded.header },
		"Encoded edit",
		payload,
	);
	const afterRecords = readInventory(reopenedPayload);
	const after = findInventoryRecord(afterRecords, target);
	if (Number(after.values._enchantLevel ?? 0) !== desired.refinement) {
		throw new Error(
			"Edited output did not reopen with the requested refinement level",
		);
	}
	if (Number(after.values._validSocketCount ?? 0) !== desired.unlockedSockets) {
		throw new Error(
			"Edited output did not reopen with the requested unlocked sockets",
		);
	}
	const afterSockets = after.sockets.map((socket) => socket.itemKey);
	if (
		JSON.stringify(afterSockets.slice(0, wanted.length)) !==
		JSON.stringify(wanted)
	) {
		throw new Error(
			"Edited output did not reopen with the requested Abyss Gear",
		);
	}
	if (
		JSON.stringify(afterSockets.slice(wanted.length)) !==
		JSON.stringify(beforeSockets.slice(wanted.length))
	) {
		throw new Error(
			"Sockets beyond the requested range changed during the edit",
		);
	}
	if (afterRecords.length !== beforeRecords.length) {
		throw new Error("Inventory record count changed during the equipment edit");
	}
	const signatures = (records: InventoryRecord[], skip: number) =>
		new Map(
			records
				.filter((record) => record.itemNo !== skip)
				.map(
					(record) =>
						[
							`${record.inventoryKey}:${record.itemNo}`,
							recordSignature(record),
						] as const,
				),
		);
	if (
		!mapsEqual(
			signatures(beforeRecords, before.itemNo),
			signatures(afterRecords, after.itemNo),
		)
	) {
		throw new Error(
			"Other inventory records changed during the equipment edit",
		);
	}

	return [
		outputBytes,
		{
			...identity,
			change_count: changes.length,
			changes,
			other_inventory_preserved: true,
			...verification,
			inventory_reparsed: true,
		},
	];
};

const u16 = (value: number): Uint8Array => {
	const buffer = new Uint8Array(2);
	writeU16(buffer, 0, value);
	return buffer;
};

const mapsEqual = (a: Map<string, string>, b: Map<string, string>): boolean => {
	if (a.size !== b.size) return false;
	for (const [key, value] of a) {
		if (b.get(key) !== value) return false;
	}
	return true;
};
