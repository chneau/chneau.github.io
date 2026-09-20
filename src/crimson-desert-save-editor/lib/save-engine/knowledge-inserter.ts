/**
 * TypeScript port of `public/python/editor/knowledge_inserter.py`.
 */

import { concatBytes, writeI64, writeU8, writeU32 } from "./bytes";
import { defined } from "./defined";
import { readKnowledge } from "./knowledge-reader";
import {
	rebaseClonePointers,
	shiftExistingBlockPointers,
	writeListCount,
} from "./parc";
import { BlockParser, parseParcBlob, serializeParc } from "./parc-serializer";
import { commitSave, openSave, sha256Hex } from "./transaction";

type InsertKnowledgeOptions = {
	knowledgeKey: number;
	templateKnowledgeKey?: number;
	level?: number;
	isNew?: boolean;
};

export const insertKnowledge = async (
	sourceBytes: Uint8Array,
	options: InsertKnowledgeOptions,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const knowledgeKey = options.knowledgeKey;
	const templateKnowledgeKey = options.templateKnowledgeKey ?? 1;
	const level = options.level ?? 1;
	const isNew = options.isNew ?? true;

	const open = await openSave(sourceBytes);
	const raw = open.original;
	const before = readKnowledge(raw);
	if (before.some((record) => record.key === knowledgeKey)) {
		return [
			sourceBytes,
			{
				edit: "insert_knowledge",
				knowledge_key: knowledgeKey,
				already_present: true,
				knowledge_count_before: before.length,
				knowledge_count_after: before.length,
				output_sha256: await sha256Hex(sourceBytes),
			},
		];
	}
	const templates = before.filter(
		(record) => record.key === templateKnowledgeKey,
	);
	if (templates.length !== 1) {
		throw new Error(
			`Expected one knowledge template, found ${templates.length}`,
		);
	}
	const template = defined(templates[0], "knowledge template");
	const required = ["_key", "_level", "_learnedFieldTime", "_isNewMark"];
	if (!required.every((name) => name in template.fieldOffsets)) {
		throw new Error(
			"Knowledge template does not contain all four scalar fields",
		);
	}

	const parc = parseParcBlob(raw);
	const parser = new BlockParser(parc);
	const entry = parc.tocEntries.find(
		(candidate) =>
			parc.typeByIndex.get(candidate.classIndex)?.name === "KnowledgeSaveData",
	);
	if (!entry) throw new Error("KnowledgeSaveData block was not found");
	const root = parser.parseRootBlock(entry.index);
	const listField = root.fields.find(
		(field) => field.name === "_list" && field.present,
	);
	if (
		!listField ||
		listField.start === undefined ||
		listField.end === undefined
	) {
		throw new Error("Knowledge _list field was not found");
	}
	const insertAbs = listField.end;
	const clone = raw.slice(template.recordStart, template.recordEnd);

	const patch = (
		name: string,
		kind: "u32" | "u64" | "u8",
		value: number,
	): void => {
		const localOffset =
			(template.fieldOffsets[name] ?? 0) - template.recordStart;
		if (kind === "u32") writeU32(clone, localOffset, value);
		else if (kind === "u64") writeI64(clone, localOffset, BigInt(value));
		else writeU8(clone, localOffset, value);
	};
	patch("_key", "u32", knowledgeKey);
	patch("_level", "u32", level);
	patch("_learnedFieldTime", "u64", 0);
	patch("_isNewMark", "u8", isNew ? 1 : 0);
	rebaseClonePointers(
		clone,
		template.recordStart,
		template.recordEnd,
		insertAbs,
	);

	const oldBlock = parc.blockRaw.get(entry.index) ?? new Uint8Array();
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
		listField.start,
		before.length + 1,
	);

	parc.modifiedBlocks.set(entry.index, newBlock);
	const editedRaw = serializeParc(parc);
	const after = readKnowledge(editedRaw);
	const inserted = after.filter((record) => record.key === knowledgeKey);
	if (inserted.length !== 1) {
		throw new Error("Knowledge record did not reparse exactly once");
	}
	const record = defined(inserted[0], "inserted knowledge record");
	if (record.level !== level || record.isNew !== isNew) {
		throw new Error("Knowledge record reparsed with unexpected values");
	}
	if (after.length !== before.length + 1) {
		throw new Error("Knowledge count did not increase by exactly one");
	}

	const { bytes, verification } = await commitSave(
		open,
		"Encoded knowledge output",
		editedRaw,
	);
	return [
		bytes,
		{
			edit: "insert_knowledge",
			knowledge_key: knowledgeKey,
			level,
			is_new: isNew,
			already_present: false,
			record_size: clone.length,
			knowledge_count_before: before.length,
			knowledge_count_after: after.length,
			raw_size_before: raw.length,
			raw_size_after: editedRaw.length,
			preexisting_records_preserved: true,
			knowledge_reparsed: true,
			...verification,
		},
	];
};
