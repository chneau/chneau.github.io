/**
 * The staged-edit vocabulary, and the one place a staged edit is dispatched.
 *
 * A save edit used to be described in three places with three vocabularies: the
 * UI's union, the session's `if (type === …)` chain plus a `Set` of companion
 * types, and the safe-edit plan DSL. Adding a feature meant touching all three.
 * Here the engine declares what it can apply — with the UI's types staying
 * assignable because they carry the same fields plus display data — and the
 * registry below maps each type to its applier once.
 *
 * Consecutive edits that share an applier run together, which is what lets the
 * quantity batch (one pass over the payload) and the companion roster (one
 * block rewrite) work.
 */

import {
	applyEquipmentChange,
	type EquipmentChange,
} from "./browser-equipment";
import {
	type InsertBrowserItemEdit,
	insertBrowserItem,
} from "./browser-inventory";
import { applySkills, type SkillChange } from "./browser-skills";
import {
	applyCharacterEdit,
	applyCharacterPreset,
	type CharacterEdit,
	type CharacterPresetEdit,
} from "./characters";
import {
	applyCompanionRename,
	type CompanionRenameEdit,
} from "./companion-names";
import { applyCompanionAdditions } from "./companions";
import { defined } from "./defined";
import { applyDyeEdit, type DyeEdit } from "./dyes";
import {
	editInventoryQuantities,
	type InventoryTarget,
} from "./inventory-editor";
import { applyItemCondition, type ItemConditionEdit } from "./item-condition";
import {
	applyQuestEdit,
	applyQuestPreset,
	type QuestEdit,
	type QuestPresetEdit,
} from "./quests";

/** One audit record, as the engine reports it. */
export type EditAudit = Record<string, unknown>;

/** A stack-count change in one inventory slot. */
export type QuantityEdit = InventoryTarget & {
	type: "quantity";
	expectedQuantity: number;
	newQuantity: number;
};

/** Adding a copy of an item already present in the save. */
export type InsertItemEdit = InsertBrowserItemEdit & { type: "insertItem" };

/** A progression change (skills, knowledge, stats). */
export type SkillsEdit = SkillChange & { type: "skills" };

/** Adding companions or robo workers to the roster. */
type CompanionEdit =
	| { type: "addCompanion"; characterKey: number }
	| { type: "addRoboWorkers"; quantity: number };

export type SaveEdit =
	| QuantityEdit
	| InsertItemEdit
	| EquipmentChange
	| SkillsEdit
	| CompanionEdit
	| DyeEdit
	| ItemConditionEdit
	| CharacterEdit
	| CharacterPresetEdit
	| QuestEdit
	| QuestPresetEdit
	| CompanionRenameEdit;

/**
 * Reports one finished edit inside a batch, and gives the caller the chance to
 * hand the main thread back before the next one starts.
 *
 * A batch can run for minutes — every equipment edit re-serializes, re-encrypts
 * and re-parses the whole save — so a run that never yields freezes the tab it
 * is drawn in, with the progress bar stuck and the browser offering to kill the
 * page.
 */
type EditProgress = (completed: number) => Promise<void>;

type Batch<Type extends SaveEdit["type"]> = {
	/** Edit types this batch applies. */
	types: readonly Type[];
	/** Progress message shown while the batch runs. */
	label: string;
	apply: (
		source: Uint8Array,
		edits: Array<Extract<SaveEdit, { type: Type }>>,
		progress: EditProgress,
	) => Promise<[Uint8Array, EditAudit[]]>;
};

/** Applies one edit at a time, collecting an audit for each. */
const sequentially =
	<Edit extends SaveEdit>(
		apply: (source: Uint8Array, edit: Edit) => Promise<[Uint8Array, EditAudit]>,
	) =>
	async (
		source: Uint8Array,
		edits: Edit[],
		progress: EditProgress,
	): Promise<[Uint8Array, EditAudit[]]> => {
		let current = source;
		const audits: EditAudit[] = [];
		for (const [index, edit] of edits.entries()) {
			const [next, audit] = await apply(current, edit);
			current = next;
			audits.push(audit);
			await progress(index + 1);
		}
		return [current, audits];
	};

/**
 * Groups a batch's edits back into the union. The registry stays a plain list
 * of typed entries; the mismatch is erased here once rather than at every call
 * site.
 */
type AnyBatch = {
	types: readonly SaveEdit["type"][];
	label: string;
	run: (
		source: Uint8Array,
		edits: SaveEdit[],
		progress: EditProgress,
	) => Promise<[Uint8Array, EditAudit[]]>;
};

const batchOf = <Type extends SaveEdit["type"]>(
	batch: Batch<Type>,
): AnyBatch => ({
	types: batch.types,
	label: batch.label,
	run: (source, edits, progress) =>
		batch.apply(
			source,
			edits as Array<Extract<SaveEdit, { type: Type }>>,
			progress,
		),
});

/** Every edit the engine can apply, with the applier that owns its type. */
const BATCHES: readonly AnyBatch[] = [
	batchOf({
		types: ["quantity"],
		label: "Applying and validating quantities",
		apply: async (source, edits) => {
			const [next, audits] = await editInventoryQuantities(
				source,
				edits.map((edit) => [
					{
						inventoryKey: edit.inventoryKey,
						slotNo: edit.slotNo,
						itemKey: edit.itemKey,
					},
					edit.expectedQuantity,
					edit.newQuantity,
				]),
			);
			return [next, audits];
		},
	}),
	batchOf({
		types: ["insertItem"],
		label: "Applying and validating change",
		apply: sequentially((source, edit) => insertBrowserItem(source, edit)),
	}),
	batchOf({
		types: ["equipment", "insertEquipment", "insertCatalogItem"],
		label: "Applying and validating change",
		apply: sequentially((source, edit) => applyEquipmentChange(source, edit)),
	}),
	batchOf({
		types: ["skills"],
		label: "Applying and validating change",
		apply: sequentially((source, edit) => applySkills(source, edit)),
	}),
	batchOf({
		types: ["addCompanion", "addRoboWorkers"],
		label: "Adding and validating companions",
		apply: async (source, edits) => {
			const [next, audit] = await applyCompanionAdditions(source, edits);
			return [next, [audit]];
		},
	}),
	batchOf({
		types: ["dye"],
		label: "Applying and validating dye colours",
		apply: sequentially((source, edit) => applyDyeEdit(source, edit)),
	}),
	batchOf({
		types: ["condition"],
		label: "Applying and validating item condition",
		apply: sequentially((source, edit) => applyItemCondition(source, edit)),
	}),
	batchOf({
		types: ["character", "characterPreset"],
		label: "Applying and validating levels",
		apply: sequentially((source, edit) =>
			edit.type === "characterPreset"
				? applyCharacterPreset(source, edit)
				: applyCharacterEdit(source, edit),
		),
	}),
	batchOf({
		types: ["quest", "questPreset"],
		label: "Applying and validating quest state",
		apply: sequentially((source, edit) =>
			edit.type === "questPreset"
				? applyQuestPreset(source, edit)
				: applyQuestEdit(source, edit),
		),
	}),
	batchOf({
		types: ["renameCompanion"],
		label: "Renaming and validating companions",
		apply: sequentially((source, edit) => applyCompanionRename(source, edit)),
	}),
];

/** One entry of a staged edit list, ready to run against the open save. */
type EditRun = {
	/** Progress message for this run. */
	label: string;
	/** How many staged edits it covers. */
	size: number;
	run: (
		source: Uint8Array,
		progress: EditProgress,
	) => Promise<[Uint8Array, EditAudit[]]>;
};

const batchFor = (edit: SaveEdit): AnyBatch => {
	const batch = BATCHES.find((candidate) =>
		candidate.types.includes(edit.type),
	);
	if (!batch) {
		throw new Error(`Unsupported edit type: ${String(edit.type)}`);
	}
	return batch;
};

/**
 * Turns a staged edit list into sequential runs, grouping neighbours that share
 * an applier so batched edits stay in one pass.
 */
export const planSaveEdits = (edits: SaveEdit[]): EditRun[] => {
	const runs: EditRun[] = [];
	let index = 0;
	while (index < edits.length) {
		const batch = batchFor(defined(edits[index], "staged edit"));
		const group: SaveEdit[] = [];
		while (index < edits.length) {
			const edit = defined(edits[index], "staged edit");
			if (batchFor(edit) !== batch) break;
			group.push(edit);
			index += 1;
		}
		runs.push({
			label: batch.label,
			size: group.length,
			run: (source, progress) => batch.run(source, group, progress),
		});
	}
	return runs;
};
