/**
 * Equipment dyeing: the per-part colour rows an item carries.
 *
 * Once an item has been dyed in-game, its `ItemSaveData` grows an
 * `_itemDyeDataList` — one `ItemDyeSaveData` row per dyeable part, each holding
 * the channels the part actually uses:
 *
 *   - `_dyeColorR` / `_dyeColorG` / `_dyeColorB` / `_dyeColorA`, a byte each;
 *   - `_grimeOpacity`, the weathering byte;
 *   - `_dyeColorGroupInfoKey`, the palette the part was dyed from (the game's
 *     `*_Color_Group_*` keys, named by the generated table);
 *   - `_texturePalleteKey`, the surface the dye sits on — cloth, metal, crystal.
 *
 * The mask is per-row and sparse: a part that only uses a tint stores no RGB at
 * all, and one that only stores a tint stores no alpha. So every channel is read
 * as present-or-`null`, and a channel the row does not carry is *refused* rather
 * than invented — writing one would mean inserting a field into a row nested
 * three levels inside the equipment block, which is a structural edit this
 * editor deliberately does not do to a save it cannot test in-game. Undyed
 * items have no list at all, so there is nothing to add to either.
 *
 * This is the same scope the reference editors ship: change the colours of gear
 * that has already been dyed, and dye the item once in-game first.
 */

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

/** The surface a dye sits on, by `_texturePalleteKey`. */
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

/** One serialized channel: its value, and where it sits in the payload. */
type Channel = {
	value: number;
	offset: number;
	size: number;
};

/** One dyeable part of an item. */
export type DyeSlot = {
	/** Row order within the item's list; the addressing handle. */
	index: number;
	/** `_dyeSlotNo`, which is what the game's material names the part by. */
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
	/** False when the row stores no channel this editor can write. */
	editable: boolean;
};

/** An equipped item that carries dye rows. */
export type DyedItem = {
	/** `_itemNo`, the record's own identity within the equipment block. */
	itemNo: number;
	itemKey: number;
	slotNo: number;
	name: string;
	slots: DyeSlot[];
};

export type DyeDescription = {
	items: DyedItem[];
	/** Palette choices, for the group picker. */
	colorGroups: Array<{ key: number; name: string }>;
	/** Surface choices, for the material picker. */
	materials: Array<{ value: number; name: string }>;
	error: string | null;
};

const dyeChannelLimits = {
	/** R, G, B, A and grime are bytes. */
	color: 255,
	colorGroup: 4294967295,
	/** `_texturePalleteKey` is two bytes in some rows and four in others. */
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

/** The `_item` child of every element of the equipment list, in order. */
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

/** Every equipped item that has been dyed, with its per-part channels. */
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

/** A colour change, on one part or on every part of one item. */
export type DyeEdit = {
	type: "dye";
	/** Equipment record identity, so the applier re-finds it by value. */
	itemNo: number;
	itemKey: number;
	slotNo: number;
	/** Row indices to change; `null` means every row of the item. */
	slotIndices: number[] | null;
	label: string;
	/** Each channel is left alone when `null`. */
	red: number | null;
	green: number | null;
	blue: number | null;
	alpha: number | null;
	grime: number | null;
	colorGroup: number | null;
	material: number | null;
};

/** One channel as the applier writes it. */
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

/** A stable description of every dye row in the payload, for the diff proof. */
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

/**
 * Rewrites the dye channels the caller asked for. Values the payload already
 * holds are skipped, and every channel is refused unless the row carries it.
 */
export const applyDyeEdit = async (
	sourceBytes: Uint8Array,
	edit: DyeEdit,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const names = await gameNamesTable();
	const decoded = await decodeSave(sourceBytes);
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
