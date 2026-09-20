/**
 * TypeScript port of `public/python/editor/equipment_loadout.py`.
 */

import { readU16, readU32, readU64 } from "./bytes";
import { defined } from "./defined";
import {
	present as fieldPresent,
	type ItemSocketRecord,
	listLayout,
	locator,
	parseFieldsWithListTrailers,
	readObjectListValues,
	readPostListScalarsFromEnd,
} from "./parc";
import type { BlockParser } from "./parc-serializer";
import { BlockParser as Parser, parseParcBlob } from "./parc-serializer";

type LocatorReference = {
	typeName: string;
	typeIndexOffset: number;
	payloadPointerOffset: number;
	payloadOffset: number;
};

/** One record of the equipped loadout, as this reader finds it. */
type EquippedItemRecord = {
	itemNo: number;
	itemKey: number;
	slotNo: number;
	stackCount: number;
	elementStart: number;
	elementEnd: number;
	itemStart: number;
	itemEnd: number;
	fieldOffsets: Record<string, number>;
	values: Record<string, unknown>;
	sockets: ItemSocketRecord[];
	dyes: Array<Record<string, unknown>>;
	locators: LocatorReference[];
};

type EquipmentLayout = {
	tocIndex: number;
	blockStart: number;
	blockEnd: number;
	listStart: number;
	listEnd: number;
	listHeaderEnd: number;
	records: EquippedItemRecord[];
};

const locatorReference = (
	raw: Uint8Array,
	cursor: number,
	typeMap: Map<number, { name: string }>,
): LocatorReference => {
	const maskCount = readU16(raw, cursor);
	if (maskCount > 0 && maskCount <= 16) {
		const typePosition = cursor + 2 + maskCount;
		const typeIndex = readU16(raw, typePosition);
		const pointerPosition = typePosition + 11;
		const payload = readU32(raw, pointerPosition);
		const typeDef = typeMap.get(typeIndex);
		if (typeDef && payload === typePosition + 15) {
			return {
				typeName: typeDef.name,
				typeIndexOffset: typePosition,
				payloadPointerOffset: pointerPosition,
				payloadOffset: payload,
			};
		}
	}

	const typePosition = cursor + 3;
	const typeIndex = readU16(raw, typePosition);
	const pointerPosition = cursor + 14;
	const payload = readU32(raw, pointerPosition);
	const typeDef = typeMap.get(typeIndex);
	if (
		readU64(raw, cursor + 6) === 0xffffffffffffffffn &&
		typeDef &&
		payload === cursor + 18
	) {
		return {
			typeName: typeDef.name,
			typeIndexOffset: typePosition,
			payloadPointerOffset: pointerPosition,
			payloadOffset: payload,
		};
	}
	throw new Error(
		`Invalid equipment locator at 0x${cursor.toString(16).toUpperCase()}`,
	);
};

const readScalarObjectList = (
	raw: Uint8Array,
	start: number,
	tail: number,
	parser: BlockParser,
	expectedType: string,
): [Array<Record<string, unknown>>, LocatorReference[]] => {
	const [count, startCursor] = listLayout(raw, start, tail);
	let cursor = startCursor;
	const rows: Array<Record<string, unknown>> = [];
	const locators: LocatorReference[] = [];
	for (let index = 0; index < count; index++) {
		const elementEnd = parser.parseListElement(cursor, tail);
		const [typeIndex, mask, payload] = locator(
			raw,
			cursor,
			parser.parc.typeByIndex,
		);
		const typeDef = parser.parc.typeByIndex.get(typeIndex);
		if (!typeDef || typeDef.name !== expectedType) {
			throw new Error(`Expected ${expectedType}, got ${typeDef?.name}`);
		}
		const [parsedFields] = parser.parseFields(
			typeDef,
			mask,
			payload + 4,
			elementEnd,
		);
		const row: Record<string, unknown> = {};
		for (const field of parsedFields) {
			if (field.present) row[field.name] = field.value;
		}
		rows.push(row);
		locators.push(locatorReference(raw, cursor, parser.parc.typeByIndex));
		cursor = elementEnd;
	}
	return [rows, locators];
};

export const readEquipmentLayout = (raw: Uint8Array): EquipmentLayout => {
	const parc = parseParcBlob(raw);
	const parser = new Parser(parc);
	const entry = parc.tocEntries.find(
		(candidate) =>
			parc.typeByIndex.get(candidate.classIndex)?.name === "EquipmentSaveData",
	);
	if (!entry) throw new Error("EquipmentSaveData block was not found");
	const root = parser.parseRootBlock(entry.index);
	const listField = root.fields.find(
		(field) => field.present && field.name === "_list",
	);
	if (
		!listField ||
		listField.start === undefined ||
		listField.end === undefined
	) {
		throw new Error("Equipment _list field was not found");
	}
	const [itemCount, headerEnd] = listLayout(
		raw,
		listField.start,
		listField.end,
	);
	let itemCursor = headerEnd;
	const records: EquippedItemRecord[] = [];

	for (let index = 0; index < itemCount; index++) {
		const elementStart = itemCursor;
		const elementEnd = parser.parseListElement(elementStart, listField.end);
		const [outerType, outerMask, outerPayload] = locator(
			raw,
			elementStart,
			parc.typeByIndex,
		);
		const outerDef = parc.typeByIndex.get(outerType);
		if (outerDef?.name !== "EquipSlotElementSaveData") {
			throw new Error(
				`Expected EquipSlotElementSaveData, got ${outerDef?.name}`,
			);
		}

		let position = outerPayload + 4;
		let itemStart: number | null = null;
		let itemEnd: number | null = null;
		for (
			let fieldIndex = 0;
			fieldIndex < outerDef.fields.length;
			fieldIndex++
		) {
			const field = defined(
				outerDef.fields[fieldIndex],
				"equipment field definition",
			);
			if (!fieldPresent(outerMask, fieldIndex)) continue;
			const start = position;
			position = parser.parseFieldValue(field, position, elementEnd)[1];
			if (field.name === "_item") {
				itemStart = start;
				itemEnd = position;
			}
		}
		if (itemStart === null || itemEnd === null) {
			throw new Error("Equipped slot does not contain an item");
		}

		const [itemType, itemMask, itemPayload] = locator(
			raw,
			itemStart,
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

		const locators: LocatorReference[] = [
			locatorReference(raw, elementStart, parc.typeByIndex),
			locatorReference(raw, itemStart, parc.typeByIndex),
		];
		let sockets: ItemSocketRecord[] = [];
		let dyes: Array<Record<string, unknown>> = [];
		for (const field of parsedFields) {
			if (
				!field.present ||
				(field.name !== "_socketSaveDataList" &&
					field.name !== "_itemDyeDataList" &&
					field.name !== "_dropResultSubSaveItemList")
			) {
				continue;
			}
			if (field.start === undefined || field.end === undefined) continue;
			const [count] = listLayout(raw, field.start, field.end);
			if (count === 0) continue;
			let nested: LocatorReference[];
			if (field.name === "_socketSaveDataList") {
				sockets = readObjectListValues(
					raw,
					field.start,
					field.end,
					parser,
					"ItemSocketSaveData",
				);
				[, nested] = readScalarObjectList(
					raw,
					field.start,
					field.end,
					parser,
					"ItemSocketSaveData",
				);
			} else if (field.name === "_itemDyeDataList") {
				const [dyeRows, dyeLocators] = readScalarObjectList(
					raw,
					field.start,
					field.end,
					parser,
					"ItemDyeSaveData",
				);
				dyes = dyeRows;
				nested = dyeLocators;
			} else {
				[, nested] = readScalarObjectList(
					raw,
					field.start,
					field.end,
					parser,
					"ItemDropResultSubSaveData",
				);
			}
			locators.push(...nested);
		}

		if ("_characterConversionData" in values) {
			throw new Error(
				"Character-conversion equipment is not yet transplantable",
			);
		}
		const required = ["_itemNo", "_itemKey", "_slotNo", "_stackCount"];
		if (!required.every((name) => name in values && name in offsets)) {
			throw new Error("Equipped item is missing required identity fields");
		}
		records.push({
			itemNo: Number(values._itemNo),
			itemKey: Number(values._itemKey),
			slotNo: Number(values._slotNo),
			stackCount: Number(values._stackCount),
			elementStart,
			elementEnd,
			itemStart,
			itemEnd,
			fieldOffsets: offsets,
			values,
			sockets,
			dyes,
			locators,
		});
		itemCursor = elementEnd;
	}

	return {
		tocIndex: entry.index,
		blockStart: entry.dataOffset,
		blockEnd: entry.dataOffset + entry.dataSize,
		listStart: listField.start,
		listEnd: listField.end,
		listHeaderEnd: headerEnd,
		records,
	};
};
