/**
 * TypeScript port of `public/python/editor/knowledge_reader.py`.
 */

import { listLayout, locator } from "./parc";
import { BlockParser, parseParcBlob } from "./parc-serializer";

type KnowledgeRecord = {
	key: number;
	level: number;
	learnedFieldTime: number | null;
	isNew: boolean | null;
	recordStart: number;
	recordEnd: number;
	fieldOffsets: Record<string, number>;
	values: Record<string, unknown>;
};

export const readKnowledge = (raw: Uint8Array): KnowledgeRecord[] => {
	const parc = parseParcBlob(raw);
	const parser = new BlockParser(parc);
	const entry = parc.tocEntries.find(
		(candidate) =>
			parc.typeByIndex.get(candidate.classIndex)?.name === "KnowledgeSaveData",
	);
	if (!entry) throw new Error("KnowledgeSaveData block was not found");
	const root = parser.parseRootBlock(entry.index);
	const field = root.fields.find(
		(candidate) => candidate.name === "_list" && candidate.present,
	);
	if (!field || field.start === undefined || field.end === undefined) {
		throw new Error("Knowledge _list field was not found");
	}
	const [count, startCursor] = listLayout(raw, field.start, field.end);
	let cursor = startCursor;
	const records: KnowledgeRecord[] = [];
	for (let index = 0; index < count; index++) {
		const end = parser.parseListElement(cursor, field.end);
		const [typeIndex, mask, payload] = locator(raw, cursor, parc.typeByIndex);
		const typeDef = parc.typeByIndex.get(typeIndex);
		if (typeDef?.name !== "KnowledgeElementSaveData") {
			throw new Error(
				`Expected KnowledgeElementSaveData, got ${typeDef?.name}`,
			);
		}
		const [parsedFields] = parser.parseFields(typeDef, mask, payload + 4, end);
		const values: Record<string, unknown> = {};
		const offsets: Record<string, number> = {};
		for (const parsed of parsedFields) {
			if (!parsed.present) continue;
			values[parsed.name] = parsed.value;
			offsets[parsed.name] = parsed.start ?? 0;
		}
		records.push({
			key: Number(values._key),
			level: Number(values._level),
			learnedFieldTime:
				"_learnedFieldTime" in values ? Number(values._learnedFieldTime) : null,
			isNew: "_isNewMark" in values ? Boolean(values._isNewMark) : null,
			recordStart: cursor,
			recordEnd: end,
			fieldOffsets: offsets,
			values,
		});
		cursor = end;
	}
	return records;
};
