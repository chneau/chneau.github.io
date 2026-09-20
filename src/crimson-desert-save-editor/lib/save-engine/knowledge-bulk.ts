/**
 * Bulk knowledge edits: the engine side of the skill / knowledge pipeline.
 *
 * Ported from `src/inserter.ts` + `src/maximize.ts` of the
 * `testing-decrypt-crimson-desert-savegame` project, whose `skills` command
 * unlocks the skill tree by injecting the knowledge entries the tree is derived
 * from. The entries *are* the skills — the game rebuilds
 * `_skillLearnSaveDataList` from them — so nothing else is touched here.
 *
 * Two things make a several-thousand-key unlock practical:
 *
 *   - every missing entry is inserted in a single block edit (one clone of the
 *     last list element per key), then the block's pointers are shifted once,
 *     instead of one insert-and-reparse per key;
 *   - levels are then written straight into the payload at the `_level` offsets
 *     the reader already reports, the same in-place scalar edit the inventory
 *     quantity path uses.
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
import { commitSave, openSave } from "./transaction";

/** A knowledge key that must end up learned, at `level`. */
export type KnowledgeTarget = {
	key: number;
	level: number;
};

/**
 * Re-level entries that are already learned but are not named in `targets`.
 * `knowledge` mode uses this to mirror the reference for every learned entry,
 * including keys the reference knows nothing about.
 */
export type LearnedRelevel = {
	reference: Map<number, number>;
	fallback: number;
};

type KnowledgeChangeOptions = {
	targets: KnowledgeTarget[];
	/** When set, learned entries outside `targets` are re-levelled too. */
	relevel?: LearnedRelevel;
};

type KnowledgeRecord = ReturnType<typeof readKnowledge>[number];

const KNOWLEDGE_BLOCK = "KnowledgeSaveData";

/** Highest level the game treats as meaningful; see the CLI's `--level` note. */
export const MAX_KNOWLEDGE_LEVEL = 99;

const checkLevel = (key: number, level: number): void => {
	if (!Number.isInteger(level) || level < 0 || level > MAX_KNOWLEDGE_LEVEL) {
		throw new Error(
			`Knowledge level for key ${key} must be a whole number between 0 and ${MAX_KNOWLEDGE_LEVEL}`,
		);
	}
};

/**
 * Resolve the level every touched key should end up at. Level 0 means
 * "present but not learned" — the game treats such an entry as unlearned.
 */
const desiredLevels = (
	records: KnowledgeRecord[],
	targets: KnowledgeTarget[],
	relevel?: LearnedRelevel,
): Map<number, number> => {
	const desired = new Map<number, number>();
	for (const target of targets) {
		if (!Number.isInteger(target.key) || target.key < 0) {
			throw new Error(`Invalid knowledge key ${target.key}`);
		}
		checkLevel(target.key, target.level);
		desired.set(target.key, target.level);
	}
	if (relevel) {
		for (const record of records) {
			if (record.level < 1 || desired.has(record.key)) continue;
			desired.set(
				record.key,
				relevel.reference.get(record.key) ?? relevel.fallback,
			);
		}
	}
	return desired;
};

const knowledgeEntry = (raw: Uint8Array) => {
	const parc = parseParcBlob(raw);
	const entry = parc.tocEntries.find(
		(candidate) =>
			parc.typeByIndex.get(candidate.classIndex)?.name === KNOWLEDGE_BLOCK,
	);
	if (!entry) throw new Error("KnowledgeSaveData block was not found");
	const parser = new BlockParser(parc);
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
	return { parc, entry, listField };
};

/**
 * Clone the last knowledge entry once per key and splice the whole run into the
 * list in a single edit, mirroring `injectKnowledgeKeys`.
 */
const insertMissing = (
	raw: Uint8Array,
	keys: number[],
	levelOf: (key: number) => number,
): { raw: Uint8Array; inserted: number } => {
	if (keys.length === 0) return { raw, inserted: 0 };
	const { parc, entry, listField } = knowledgeEntry(raw);
	const records = readKnowledge(raw);
	const template = records.at(-1);
	if (!template) {
		throw new Error("Knowledge list has no entry to clone as a template");
	}
	const keyOffset = template.fieldOffsets._key;
	const levelOffset = template.fieldOffsets._level;
	if (keyOffset === undefined || levelOffset === undefined) {
		throw new Error("Knowledge template is missing its _key or _level field");
	}
	const insertAbs = defined(listField.end, "knowledge list end");

	const clones: Uint8Array[] = [];
	let cursor = insertAbs;
	for (const key of keys) {
		const clone = raw.slice(template.recordStart, template.recordEnd);
		const patch = (name: string, value: number): void => {
			const offset = template.fieldOffsets[name];
			if (offset === undefined) return;
			writeU32(clone, offset - template.recordStart, value);
		};
		patch("_key", key);
		patch("_level", levelOf(key));
		// A freshly injected entry is not a "new" marker in the UI, and carries
		// no learned timestamp — the reference save has neither either.
		const learnedOffset = template.fieldOffsets._learnedFieldTime;
		if (learnedOffset !== undefined) {
			writeI64(clone, learnedOffset - template.recordStart, 0n);
		}
		const newMarkOffset = template.fieldOffsets._isNewMark;
		if (newMarkOffset !== undefined) {
			writeU8(clone, newMarkOffset - template.recordStart, 0);
		}
		rebaseClonePointers(
			clone,
			template.recordStart,
			template.recordEnd,
			cursor,
		);
		clones.push(clone);
		cursor += clone.length;
	}

	const payload = concatBytes(...clones);
	const oldBlock = parc.blockRaw.get(entry.index) ?? new Uint8Array();
	const insertOffset = insertAbs - entry.dataOffset;
	const newBlock = concatBytes(
		oldBlock.slice(0, insertOffset),
		payload,
		oldBlock.slice(insertOffset),
	);
	shiftExistingBlockPointers(
		oldBlock,
		newBlock,
		entry.dataOffset,
		insertAbs,
		payload.length,
	);
	writeListCount(
		newBlock,
		entry.dataOffset,
		defined(listField.start, "knowledge list start"),
		records.length + clones.length,
	);

	parc.modifiedBlocks.set(entry.index, newBlock);
	return { raw: serializeParc(parc), inserted: clones.length };
};

/** Write `_level` in place for every entry whose level does not match. */
const patchLevels = (
	raw: Uint8Array,
	records: KnowledgeRecord[],
	desired: Map<number, number>,
): { raw: Uint8Array; patched: number; relearned: number } => {
	const edited = raw.slice();
	let patched = 0;
	let relearned = 0;
	for (const record of records) {
		const target = desired.get(record.key);
		if (target === undefined || target === record.level) continue;
		const offset = record.fieldOffsets._level;
		if (offset === undefined) {
			throw new Error(
				`Knowledge entry ${record.key} has no serialized _level field`,
			);
		}
		writeU32(edited, offset, target);
		patched += 1;
		// Level 0 means unlearned; bringing it back is the CLI's "relearn".
		if (record.level === 0 && target >= 1) relearned += 1;
	}
	return { raw: edited, patched, relearned };
};

const levelMap = (records: KnowledgeRecord[]): Map<number, number> =>
	new Map(records.map((record) => [record.key, record.level]));

/**
 * Make every target key learned at its target level: missing entries are
 * injected, existing ones are re-levelled in place. Returns the re-encrypted
 * save and an audit record; when nothing needs to change the source bytes come
 * back untouched so a no-op never rewrites the container.
 */
export const applyKnowledgeChange = async (
	sourceBytes: Uint8Array,
	options: KnowledgeChangeOptions,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const open = await openSave(sourceBytes);
	const before = readKnowledge(open.original);
	const beforeLevels = levelMap(before);
	const desired = desiredLevels(before, options.targets, options.relevel);

	const missing = [...desired.keys()]
		.filter((key) => !beforeLevels.has(key))
		.sort((a, b) => a - b);
	const insertion = insertMissing(
		open.original,
		missing,
		(key) => desired.get(key) ?? 1,
	);
	// Insertion moves everything after the list, so the level offsets have to be
	// read again before they can be patched.
	const shifted = readKnowledge(insertion.raw);
	const patching = patchLevels(insertion.raw, shifted, desired);
	const editedRaw = patching.raw;

	const after = readKnowledge(editedRaw);
	const afterLevels = levelMap(after);
	for (const [key, level] of desired) {
		if (afterLevels.get(key) !== level) {
			throw new Error(
				`Knowledge entry ${key} did not reparse at level ${level}`,
			);
		}
	}
	for (const [key, level] of beforeLevels) {
		const expected = desired.get(key) ?? level;
		if (afterLevels.get(key) !== expected) {
			throw new Error(
				`Knowledge entry ${key} changed unexpectedly (${level} -> ${afterLevels.get(
					key,
				)}, wanted ${expected})`,
			);
		}
	}
	if (afterLevels.size !== beforeLevels.size + missing.length) {
		throw new Error(
			`Knowledge count changed unexpectedly (${beforeLevels.size} -> ${afterLevels.size})`,
		);
	}

	const changed = missing.length > 0 || patching.patched > 0;
	const audit: Record<string, unknown> = {
		edit: "knowledge",
		injected: missing.length,
		relearned: patching.relearned,
		patched: patching.patched,
		keys_before: beforeLevels.size,
		keys_after: afterLevels.size,
		learned_before: [...beforeLevels.values()].filter((level) => level >= 1)
			.length,
		learned_after: [...afterLevels.values()].filter((level) => level >= 1)
			.length,
		changed,
		injected_keys: missing.slice(0, 50),
		output_reopened: false,
	};
	if (!changed) {
		return [sourceBytes, audit];
	}

	const { bytes, reopenedPayload, verification } = await commitSave(
		open,
		"Encoded knowledge output",
		editedRaw,
	);
	const reopenedLevels = levelMap(readKnowledge(reopenedPayload));
	for (const [key, level] of desired) {
		if (reopenedLevels.get(key) !== level) {
			throw new Error(
				`Encoded output lost knowledge entry ${key} (level ${level})`,
			);
		}
	}
	return [bytes, { ...audit, ...verification }];
};
