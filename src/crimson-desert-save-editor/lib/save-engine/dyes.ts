import { type DecodedSave, decodeSave } from "./container";
import { type GameNamesFile, gameNamesTable, itemCatalogTable } from "./data";
import { defined } from "./defined";
import {
	inlineChild,
	type RootObject,
	readRoot,
	rootField,
	type WalkedObject,
	walkObjectList,
} from "./object-walk";
import { patchScalars, type ScalarWrite } from "./scalar-patch";
import { commitSave } from "./transaction";

const dyeMaterialNames: Record<number, string> = {
	0: "Default",
	1: "Cloth",
	2: "Leather",
	3: "Metal",
	4: "Wool",
	5: "Velvet",
	6: "Silk",
	7: "Linen",
	8: "Fur",
	9: "Chain",
	10: "Crystal",
};

type Channel = {
	value: number;
	offset: number;
	size: number;
};

export type DyeSlot = {
	index: number;
	slotNo: number | null;
	name: string;
	red: Channel | null;
	green: Channel | null;
	blue: Channel | null;
	alpha: Channel | null;
	grime: Channel | null;
	colorGroup: Channel | null;
	colorGroupName: string | null;
	material: Channel | null;
	materialName: string | null;
	editable: boolean;
};

export type DyedItem = {
	itemNo: number;
	itemKey: number;
	slotNo: number;
	name: string;
	slots: DyeSlot[];
};

export type DyeDescription = {
	items: DyedItem[];
	colorGroups: Array<{ key: number; name: string }>;
	materials: Array<{ value: number; name: string }>;
	error: string | null;
};

const dyeChannelLimits = {
	color: 255,
	colorGroup: 4294967295,
	material: 65535,
} as const;

const channelOf = (object: WalkedObject, name: string): Channel | null => {
	const offset = object.offsets[name];
	const value = object.values[name];
	if (offset === undefined || typeof value !== "number") return null;
	const field = object.fields.find((candidate) => candidate.name === name);
	if (!field || field.start === undefined || field.end === undefined) {
		return null;
	}
	return { value, offset, size: field.end - field.start };
};

const numberOrNull = (object: WalkedObject, name: string): number | null => {
	const value = object.values[name];
	return typeof value === "number" ? value : null;
};

const dyedItems = (
	root: RootObject,
): Array<{
	item: WalkedObject;
	list: WalkedObject[];
}> => {
	const found: Array<{ item: WalkedObject; list: WalkedObject[] }> = [];
	for (const element of walkObjectList(root.parser, rootField(root, "_list"))) {
		const item = inlineChild(root.parser, element, "_item");
		if (!item) continue;
		const field = item.fields.find(
			(candidate) => candidate.name === "_itemDyeDataList" && candidate.present,
		);
		if (!field) continue;
		const rows = walkObjectList(root.parser, field);
		if (rows.length === 0) continue;
		found.push({ item, list: rows });
	}
	return found;
};

const readSlots = (rows: WalkedObject[], names: GameNamesFile): DyeSlot[] => {
	return rows.map((row, index) => {
		const colorGroup = channelOf(row, "_dyeColorGroupInfoKey");
		const material = channelOf(row, "_texturePalleteKey");
		const slotNo = numberOrNull(row, "_dyeSlotNo");
		return {
			index,
			slotNo,
			name: slotNo === null ? `Part ${index + 1}` : `Part ${slotNo + 1}`,
			red: channelOf(row, "_dyeColorR"),
			green: channelOf(row, "_dyeColorG"),
			blue: channelOf(row, "_dyeColorB"),
			alpha: channelOf(row, "_dyeColorA"),
			grime: channelOf(row, "_grimeOpacity"),
			colorGroup,
			colorGroupName: colorGroup
				? (names.dyeColorGroups[String(colorGroup.value)] ?? null)
				: null,
			material,
			materialName: material
				? (dyeMaterialNames[material.value] ?? null)
				: null,
			editable: [
				"_dyeColorR",
				"_dyeColorG",
				"_dyeColorB",
				"_dyeColorA",
				"_grimeOpacity",
				"_dyeColorGroupInfoKey",
				"_texturePalleteKey",
			].some((name) => row.offsets[name] !== undefined),
		};
	});
};

export const describeDyes = async (
	save: DecodedSave,
): Promise<DyeDescription> => {
	const [names, catalog] = await Promise.all([
		gameNamesTable(),
		itemCatalogTable(),
	]);
	const colorGroups = Object.entries(names.dyeColorGroups)
		.map(([key, name]) => ({ key: Number(key), name }))
		.sort((a, b) => a.name.localeCompare(b.name));
	const materials = Object.entries(dyeMaterialNames)
		.map(([value, name]) => ({ value: Number(value), name }))
		.sort((a, b) => a.value - b.value);
	try {
		const root = readRoot(save.rawPayload, "EquipmentSaveData");
		const items = dyedItems(root).map(({ item, list }) => {
			const itemKey = numberOrNull(item, "_itemKey") ?? 0;
			return {
				itemNo: numberOrNull(item, "_itemNo") ?? 0,
				itemKey,
				slotNo: numberOrNull(item, "_slotNo") ?? 0,
				name: catalog.items[String(itemKey)]?.name ?? `Item ${itemKey}`,
				slots: readSlots(list, names),
			};
		});
		return { items, colorGroups, materials, error: null };
	} catch (error) {
		return {
			items: [],
			colorGroups,
			materials,
			error: `Dye editing is unavailable for this save: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
};

export type DyeEdit = {
	type: "dye";
	itemNo: number;
	itemKey: number;
	slotNo: number;
	slotIndices: number[] | null;
	label: string;
	red: number | null;
	green: number | null;
	blue: number | null;
	alpha: number | null;
	grime: number | null;
	colorGroup: number | null;
	material: number | null;
};

const WRITABLE = [
	{ key: "red", field: "_dyeColorR", limit: dyeChannelLimits.color },
	{ key: "green", field: "_dyeColorG", limit: dyeChannelLimits.color },
	{ key: "blue", field: "_dyeColorB", limit: dyeChannelLimits.color },
	{ key: "alpha", field: "_dyeColorA", limit: dyeChannelLimits.color },
	{ key: "grime", field: "_grimeOpacity", limit: dyeChannelLimits.color },
	{
		key: "colorGroup",
		field: "_dyeColorGroupInfoKey",
		limit: dyeChannelLimits.colorGroup,
	},
	{
		key: "material",
		field: "_texturePalleteKey",
		limit: dyeChannelLimits.material,
	},
] as const;

const dyeSignature = (raw: Uint8Array, names: GameNamesFile): string => {
	try {
		const root = readRoot(raw, "EquipmentSaveData");
		return JSON.stringify(
			dyedItems(root).map(({ item, list }) => [
				numberOrNull(item, "_itemNo"),
				readSlots(list, names).map((slot) => [
					slot.slotNo,
					slot.red?.value ?? null,
					slot.green?.value ?? null,
					slot.blue?.value ?? null,
					slot.alpha?.value ?? null,
					slot.grime?.value ?? null,
					slot.colorGroup?.value ?? null,
					slot.material?.value ?? null,
				]),
			]),
		);
	} catch {
		return "";
	}
};

export const applyDyeEdit = async (
	sourceBytes: Uint8Array,
	edit: DyeEdit,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const [names, decoded] = await Promise.all([
		gameNamesTable(),
		decodeSave(sourceBytes),
	]);
	const raw = decoded.rawPayload;
	const root = readRoot(raw, "EquipmentSaveData");
	const target = dyedItems(root).find(({ item }) => {
		return (
			numberOrNull(item, "_itemNo") === edit.itemNo &&
			numberOrNull(item, "_itemKey") === edit.itemKey &&
			numberOrNull(item, "_slotNo") === edit.slotNo
		);
	});
	if (!target) {
		throw new Error(
			`This save has no dyed equipment record ${edit.itemNo} (item ${edit.itemKey})`,
		);
	}
	const rows = target.list;
	const indices =
		edit.slotIndices === null
			? rows.map((_row, index) => index)
			: [...new Set(edit.slotIndices)].sort((a, b) => a - b);
	if (indices.length === 0) {
		throw new Error("No dye part was selected");
	}

	const writes: ScalarWrite[] = [];
	const requested: Array<{
		index: number;
		field: string;
		value: number;
		limit: number;
	}> = [];
	for (const index of indices) {
		const row = rows[index];
		if (!row) {
			throw new Error(`This item has no dye part at index ${index}`);
		}
		for (const channel of WRITABLE) {
			const value = edit[channel.key];
			if (value === null || value === undefined) continue;
			if (!Number.isInteger(value) || value < 0 || value > channel.limit) {
				throw new Error(
					`${channel.field} must be a whole number between 0 and ${channel.limit}`,
				);
			}
			const field = row.fields.find(
				(candidate) => candidate.name === channel.field,
			);
			if (
				!field?.present ||
				field.start === undefined ||
				field.end === undefined
			) {
				if (edit.slotIndices === null) continue;
				throw new Error(
					`Dye part ${index + 1} of this item does not store ${channel.field.replace(
						/^_/,
						"",
					)}`,
				);
			}
			const existing =
				typeof row.values[channel.field] === "number"
					? (row.values[channel.field] as number)
					: null;
			if (existing === value) continue;
			writes.push({
				offset: field.start,
				size: field.end - field.start,
				value,
				label: `${channel.field} of dye part ${index + 1}`,
			});
			requested.push({
				index,
				field: channel.field,
				value,
				limit: channel.limit,
			});
		}
	}
	if (writes.length === 0) {
		throw new Error("The requested colours are already stored on this item");
	}

	const patched = patchScalars(raw, "Dye edit", writes);
	const { bytes, reopenedPayload, verification } = await commitSave(
		{ original: raw, header: decoded.header },
		"Dye edit",
		patched.payload,
	);

	const after = readRoot(reopenedPayload, "EquipmentSaveData");
	const repaired = dyedItems(after).find(({ item }) => {
		return (
			numberOrNull(item, "_itemNo") === edit.itemNo &&
			numberOrNull(item, "_itemKey") === edit.itemKey &&
			numberOrNull(item, "_slotNo") === edit.slotNo
		);
	});
	if (!repaired) {
		throw new Error("The dyed equipment record disappeared during the edit");
	}
	const slots = readSlots(repaired.list, names);
	for (const entry of requested) {
		const slot = defined(slots[entry.index], "dye part after the edit");
		const stored = (
			{
				_dyeColorR: slot.red,
				_dyeColorG: slot.green,
				_dyeColorB: slot.blue,
				_dyeColorA: slot.alpha,
				_grimeOpacity: slot.grime,
				_dyeColorGroupInfoKey: slot.colorGroup,
				_texturePalleteKey: slot.material,
			} as Record<string, Channel | null>
		)[entry.field];
		if (stored?.value !== entry.value) {
			throw new Error(
				`Edited output did not reparse with the requested ${entry.field} on part ${
					entry.index + 1
				}`,
			);
		}
	}
	if (dyeSignature(raw, names) === dyeSignature(reopenedPayload, names)) {
		throw new Error("Dye edit did not change anything");
	}

	return [
		bytes,
		{
			edit: "dye",
			item_no: edit.itemNo,
			item_key: edit.itemKey,
			slot: edit.slotNo,
			parts_changed: indices.length,
			fields_written: patched.labels,
			raw_changed_byte_offsets: patched.changed,
			...verification,
			dyes_reparsed: true,
		},
	];
};
