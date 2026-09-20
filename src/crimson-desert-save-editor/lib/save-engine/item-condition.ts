/**
 * An item's wear: endurance, sharpness and the charges a useable item has left.
 *
 * These are plain scalars on `ItemSaveData`, so they are written in place and
 * proved like any other field. Two details shape the API:
 *
 *   - every field is optional in the record's presence mask. Endurance is
 *     stored on every item in both fixtures, sharpness only on the 26 and 120
 *     items that can be sharpened, and a naturally acquired item often omits a
 *     charge count that still holds its default. A field the record does not
 *     carry is reported as `null` rather than as zero, so the editor offers it
 *     only where the save can actually hold it;
 *   - `_chargedUseableCount` is the *remaining* uses and `_maxChargeUseableCount`
 *     the cap, and the game derives the two independently, so both are editable.
 */

import { type DecodedSave, decodeSave } from "./container";
import {
	findInventoryRecord,
	type InventoryRecord,
	readInventory,
} from "./inventory-reader";
import { patchScalars, type ScalarWrite } from "./scalar-patch";
import { commitSave } from "./transaction";

/** The wear fields of one item, `null` where the record does not store them. */
type ItemCondition = {
	endurance: number | null;
	sharpness: number | null;
	chargedUses: number | null;
	maxChargedUses: number | null;
};

/** Highest value each field can hold, matching its serialized width. */
const conditionLimits = {
	endurance: 65535,
	sharpness: 65535,
	chargedUses: 999_999_999,
	maxChargedUses: 999_999_999,
} as const;

const field = (record: InventoryRecord, name: string): number | null => {
	if (record.fieldOffsets[name] === undefined) return null;
	const value = record.values[name];
	return typeof value === "number" ? value : null;
};

const describeCondition = (record: InventoryRecord): ItemCondition => {
	return {
		endurance: field(record, "_endurance"),
		sharpness: field(record, "_sharpness"),
		chargedUses: field(record, "_chargedUseableCount"),
		maxChargedUses: field(record, "_maxChargeUseableCount"),
	};
};

/** A condition change, plus the names the staged list shows. */
export type ItemConditionEdit = {
	type: "condition";
	inventoryKey: number;
	slotNo: number;
	itemKey: number;
	itemName: string;
	/** `null` leaves the field as it is. */
	endurance: number | null;
	sharpness: number | null;
	chargedUses: number | null;
};

const FIELDS: Array<{
	key: "endurance" | "sharpness" | "chargedUses";
	name: string;
	size: number;
	limit: number;
}> = [
	{
		key: "endurance",
		name: "_endurance",
		size: 2,
		limit: conditionLimits.endurance,
	},
	{
		key: "sharpness",
		name: "_sharpness",
		size: 2,
		limit: conditionLimits.sharpness,
	},
	{
		key: "chargedUses",
		name: "_chargedUseableCount",
		size: 8,
		limit: conditionLimits.chargedUses,
	},
];

/** Rewrites the wear fields the caller asked for. */
export const applyItemCondition = async (
	sourceBytes: Uint8Array,
	edit: ItemConditionEdit,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const decoded = await decodeSave(sourceBytes);
	const raw = decoded.rawPayload;
	const before = findInventoryRecord(readInventory(raw), {
		inventoryKey: edit.inventoryKey,
		slotNo: edit.slotNo,
		itemKey: edit.itemKey,
	});
	const current = describeCondition(before);
	const writes: ScalarWrite[] = [];
	/** What the caller asked for, kept with the field name for the proof. */
	const requested: Array<{
		key: keyof ItemCondition;
		name: string;
		value: number;
	}> = [];
	for (const field of FIELDS) {
		const value = edit[field.key];
		if (value === null || value === undefined) continue;
		if (!Number.isInteger(value) || value < 0 || value > field.limit) {
			throw new Error(
				`${field.name} must be a whole number between 0 and ${field.limit}`,
			);
		}
		const offset = before.fieldOffsets[field.name];
		if (offset === undefined) {
			throw new Error(
				`This item does not store ${field.name.replace(
					/^_/,
					"",
				)}; the save leaves it at its default`,
			);
		}
		const existing = Number(before.values[field.name] ?? 0);
		if (existing === value) continue;
		writes.push({
			offset,
			size: field.size,
			value,
			label: `${field.name} of item ${edit.itemKey}`,
		});
		requested.push({ key: field.key, name: field.name, value });
	}
	if (writes.length === 0) {
		throw new Error("The requested values are already stored on this item");
	}

	const patched = patchScalars(raw, "Item condition edit", writes);
	const { bytes, reopenedPayload, verification } = await commitSave(
		{ original: raw, header: decoded.header },
		"Item condition edit",
		patched.payload,
	);

	const after = findInventoryRecord(readInventory(reopenedPayload), {
		inventoryKey: edit.inventoryKey,
		slotNo: edit.slotNo,
		itemKey: edit.itemKey,
	});
	const repaired = describeCondition(after);
	for (const entry of requested) {
		if (repaired[entry.key] !== entry.value) {
			throw new Error(
				`Edited output did not reparse with the requested ${entry.name}`,
			);
		}
	}
	const untouched = describeCondition(before);
	for (const field of FIELDS) {
		if (requested.some((entry) => entry.name === field.name)) continue;
		if (untouched[field.key] !== repaired[field.key]) {
			throw new Error(`${field.name} changed without being requested`);
		}
	}
	if (
		after.itemNo !== before.itemNo ||
		after.stackCount !== before.stackCount
	) {
		throw new Error("Item identity changed during a condition edit");
	}

	return [
		bytes,
		{
			edit: "item_condition",
			inventory_key: edit.inventoryKey,
			slot: edit.slotNo,
			item_key: edit.itemKey,
			before: current,
			after: repaired,
			fields_written: requested.map((entry) => entry.name),
			raw_changed_byte_offsets: patched.changed,
			...verification,
			inventory_reparsed: true,
		},
	];
};

/** One item the editor can change, with the wear it currently has. */
export type ConditionEntry = {
	inventoryKey: number;
	slotNo: number;
	itemKey: number;
	stackCount: number;
	condition: ItemCondition;
};

export type ConditionDescription = {
	entries: ConditionEntry[];
	limits: typeof conditionLimits;
	error: string | null;
};

const hasCondition = (condition: ItemCondition): boolean =>
	Object.values(condition).some((value) => value !== null);

/**
 * Every item whose record stores a wear field, so the editor can list them
 * without walking the payload again. Items that store none — currency, most
 * materials — are left out rather than shown as uneditable rows.
 */
export const describeItemConditions = async (
	save: DecodedSave,
): Promise<ConditionDescription> => {
	try {
		const entries = readInventory(save.rawPayload)
			.map((record) => ({
				inventoryKey: record.inventoryKey,
				slotNo: record.slotNo,
				itemKey: record.itemKey,
				stackCount: record.stackCount,
				condition: describeCondition(record),
			}))
			.filter((entry) => hasCondition(entry.condition));
		return { entries, limits: conditionLimits, error: null };
	} catch (error) {
		return {
			entries: [],
			limits: conditionLimits,
			error: `Item wear editing is unavailable for this save: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
};
