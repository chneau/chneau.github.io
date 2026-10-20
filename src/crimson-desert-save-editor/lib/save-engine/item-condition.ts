import { type DecodedSave, decodeSave } from "./container";
import {
	findInventoryRecord,
	type InventoryRecord,
	readInventory,
} from "./inventory-reader";
import { locator } from "./parc";
import { parseParcBlob, type TypeDef } from "./parc-serializer";
import { patchScalars, type ScalarWrite } from "./scalar-patch";
import { commitSave } from "./transaction";

type ItemCondition = {
	endurance: number | null;
	sharpness: number | null;
	chargedUses: number | null;
	maxChargedUses: number | null;
};

const conditionLimits = {
	endurance: 65535,
	sharpness: 65535,
	chargedUses: 999_999_999,
	maxChargedUses: 999_999_999,
} as const;

const SCALAR_SIZES: Record<number, true> = {
	1: true,
	2: true,
	4: true,
	8: true,
};

const scalarFieldWidth = (field: TypeDef["fields"][number]): number => {
	if (
		(field.metaKind !== 0 && field.metaKind !== 2) ||
		!SCALAR_SIZES[field.metaSize] ||
		/float|double/i.test(field.typeName)
	) {
		throw new Error(
			`Field ${field.name} is not a supported scalar (kind ${field.metaKind}, size ${field.metaSize}, type ${field.typeName})`,
		);
	}
	return field.metaSize;
};

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

export type ItemConditionEdit = {
	type: "condition";
	inventoryKey: number;
	slotNo: number;
	itemKey: number;
	itemName: string;
	endurance: number | null;
	sharpness: number | null;
	chargedUses: number | null;
};

const FIELDS: Array<{
	key: "endurance" | "sharpness" | "chargedUses";
	name: string;
	limit: number;
}> = [
	{
		key: "endurance",
		name: "_endurance",
		limit: conditionLimits.endurance,
	},
	{
		key: "sharpness",
		name: "_sharpness",
		limit: conditionLimits.sharpness,
	},
	{
		key: "chargedUses",
		name: "_chargedUseableCount",
		limit: conditionLimits.chargedUses,
	},
];

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
	const parc = parseParcBlob(raw);
	const [itemTypeIndex] = locator(raw, before.recordStart, parc.typeByIndex);
	const itemType = parc.typeByIndex.get(itemTypeIndex);
	if (!itemType) throw new Error("Item type was not found");
	const current = describeCondition(before);
	const writes: ScalarWrite[] = [];
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
		const definition = itemType.fields.find(
			(candidate) => candidate.name === field.name,
		);
		if (!definition) {
			throw new Error(`The item type has no ${field.name} field`);
		}
		writes.push({
			offset,
			size: scalarFieldWidth(definition),
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
