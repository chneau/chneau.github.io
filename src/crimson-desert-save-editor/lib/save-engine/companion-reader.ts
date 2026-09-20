/**
 * TypeScript port of `public/python/editor/companion_reader.py`.
 */

import { readU16, readU32 } from "./bytes";
import { defined } from "./defined";
import { listLayout, locator, relativizeInlinePointers } from "./parc";
import type { ParcBlob, TOCEntry, TypeDef } from "./parc-serializer";
import { BlockParser, parseParcBlob } from "./parc-serializer";

type CompanionRecord = {
	start: number;
	end: number;
	payload: number;
	mask: Uint8Array;
	values: Record<string, unknown>;
	offsets: Record<string, number>;
};

export type ClanLayout = {
	parc: ParcBlob;
	entry: TOCEntry;
	listStart: number;
	listEnd: number;
	records: CompanionRecord[];
};

/** Read identity/state prefix; post-list scalar decoding is not established. */
export const readClan = (raw: Uint8Array): ClanLayout => {
	const parc = parseParcBlob(raw);
	const parser = new BlockParser(parc);
	const entries = parc.tocEntries.filter(
		(entry) =>
			parc.typeByIndex.get(entry.classIndex)?.name === "MercenaryClanSaveData",
	);
	if (entries.length !== 1) {
		throw new Error("Expected one companion collection");
	}
	const entry = defined(entries[0], "companion collection entry");
	const root = parser.parseRootBlock(entry.index);
	const field = root.fields.find(
		(candidate) => candidate.name === "_mercenaryDataList" && candidate.present,
	);
	if (!field || field.start === undefined || field.end === undefined) {
		throw new Error("Companion data list was not found");
	}
	const [count, startCursor] = listLayout(raw, field.start, field.end);
	if (!(count > 0 && count < 10000)) {
		throw new Error("Unsupported companion list count");
	}
	let cursor = startCursor;
	const records: CompanionRecord[] = [];
	for (let index = 0; index < count; index++) {
		const end = parser.parseListElement(cursor, field.end);
		const [typeIndex, mask, payload] = locator(raw, cursor, parc.typeByIndex);
		const kind = parc.typeByIndex.get(typeIndex);
		if (
			kind?.name !== "MercenarySaveData" ||
			!(cursor < payload && payload < end && end <= field.end)
		) {
			throw new Error("Invalid companion record boundary");
		}
		if (readU32(raw, end - 4) !== end - 4 - payload) {
			throw new Error("Companion size trailer mismatch");
		}
		const values: Record<string, unknown> = {};
		const offsets: Record<string, number> = {};
		let position = payload + 4;
		for (let fieldIndex = 0; fieldIndex < kind.fields.length; fieldIndex++) {
			const definition = defined(
				kind.fields[fieldIndex],
				"companion field definition",
			);
			// Empty list markers serialize even without a presence bit.
			if (definition.metaKind === 6 || definition.metaKind === 7) break;
			if (
				Math.floor(fieldIndex / 8) >= mask.length ||
				(((mask[Math.floor(fieldIndex / 8)] ?? 0) >> (fieldIndex % 8)) & 1) ===
					0
			) {
				continue;
			}
			const [value, following] = parser.parseFieldValue(
				definition,
				position,
				end - 4,
			);
			if (!(position < following && following <= end - 4)) {
				throw new Error("Companion field exceeds its record");
			}
			values[definition.name] = value;
			offsets[definition.name] = position;
			position = following;
		}
		if (
			typeof values._characterKey !== "number" ||
			typeof values._mercenaryNo !== "number"
		) {
			throw new Error("Companion identity missing");
		}
		records.push({ start: cursor, end, payload, mask, values, offsets });
		cursor = end;
	}
	if (cursor !== field.end) {
		throw new Error("Companion list not consumed exactly");
	}
	return {
		parc,
		entry,
		listStart: field.start,
		listEnd: field.end,
		records,
	};
};

type CompanionLocator = {
	typePosition: number;
	pointerPosition: number;
	type: TypeDef;
};

/** Identify every self-pointing full locator; reject any ambiguous sentinel. */
export const recordLocators = (
	raw: Uint8Array,
	record: CompanionRecord,
	parc: ParcBlob,
): CompanionLocator[] => {
	let cursor = record.start;
	const result: CompanionLocator[] = [];
	for (;;) {
		const found = findSentinel(raw, cursor, record.end);
		if (found < 0) break;
		const pointerPos = found + 8;
		if (
			pointerPos + 4 > record.end ||
			readU32(raw, pointerPos) !== pointerPos + 4
		) {
			throw new Error("Unsupported non-inline companion reference");
		}
		const typePos = found - 3;
		const typeIndex = readU16(raw, typePos);
		const typeDef = parc.typeByIndex.get(typeIndex);
		if (!typeDef || (raw[typePos + 2] ?? 0) !== 0) {
			throw new Error("Unsupported companion locator type");
		}
		const width = Math.ceil(typeDef.fields.length / 8);
		const maskStart = typePos - width - 2;
		const starts: number[] = [];
		if (
			width >= 1 &&
			width <= 16 &&
			maskStart >= record.start &&
			readU16(raw, maskStart) === width
		) {
			starts.push(maskStart);
		}
		if (starts.length !== 1) {
			throw new Error("Ambiguous companion locator mask");
		}
		result.push({
			typePosition: typePos,
			pointerPosition: pointerPos,
			type: typeDef,
		});
		cursor = pointerPos + 4;
	}
	if (
		result.length === 0 ||
		defined(result[0], "companion root locator").typePosition !==
			record.start + 2 + record.mask.length
	) {
		throw new Error("Companion root locator missing");
	}
	return result;
};

const findSentinel = (raw: Uint8Array, from: number, end: number): number => {
	for (let start = from; start <= end - 8; start++) {
		let match = true;
		for (let index = 0; index < 8; index++) {
			if (raw[start + index] !== 0xff) {
				match = false;
				break;
			}
		}
		if (match) return start;
	}
	return -1;
};

/**
 * Rewrites inline self-pointers so they are relative to `base`.
 *
 * `base` is the record's absolute position, so a clone can be compared against
 * a record parsed from the edited buffer (which sits at a different offset).
 */
export const normalizeCompanionBytes = (
	blob: Uint8Array,
	base: number,
): Uint8Array => relativizeInlinePointers(blob, base);

export const normalizedCompanionRecord = (
	raw: Uint8Array,
	record: CompanionRecord,
): Uint8Array => {
	return normalizeCompanionBytes(
		raw.slice(record.start, record.end),
		record.start,
	);
};
