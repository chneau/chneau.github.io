/**
 * TypeScript port of `public/python/editor/browser_equipment.py`.
 *
 * Browser-facing equipment descriptions and guarded edit-plan translation.
 */

import { requireCompatibleGear } from "./abyss-gear-compatibility";
import {
	equipmentCatalog,
	insertCatalogEquipment,
	insertCatalogItem,
} from "./catalog-equipment";
import type { DecodedSave } from "./container";
import type { EquipmentCatalogEntry } from "./data";
import { defined } from "./defined";
import { setEquipment } from "./equipment-editor";
import { readInventory } from "./inventory-reader";
import { applyItemDiscovery } from "./item-discovery";
import { sha256Hex } from "./transaction";

type EquipmentDetailsPayload = {
	refinement: number;
	canRefine: boolean;
	refinementLevels: number[];
	unlockedSockets: number;
	socketCap: number | null;
	socketItems: Array<number | null>;
};

type InventoryDescriptionRecord = {
	inventoryKey: number;
	itemNo: string;
	itemKey: number;
	slotNo: number;
	quantity: number;
	socketCount: number;
	filledSockets: number;
	equipment: EquipmentDetailsPayload | null;
	noGearToEdit: boolean;
};

export type InventoryDescription = {
	containerVersion: number;
	payloadBytes: number;
	records: InventoryDescriptionRecord[];
};

/** What a record's own fields hold about its gear, before the catalog is read. */
export type RecordGearState = {
	refinement: number;
	unlockedSockets: number;
	/** Every socket position, a filled one holding the Gear it holds. */
	socketItems: Array<number | null>;
	/** How many of those positions hold Gear. */
	filledSockets: number;
};

/** Whether the catalog presents an item as equipment the editor can configure. */
const isEquipmentItem = (
	definition: EquipmentCatalogEntry | undefined,
): definition is EquipmentCatalogEntry =>
	Boolean(
		definition && (definition.characterEquipment || definition.canRefine),
	);

/**
 * The gear one record has: its own numbers, read under its catalog entry.
 *
 * This is the only place that decides the shape, and both callers come through
 * it — the parse of a saved record, and the projection that previews a record
 * a staged edit will create — so a preview cannot drift from what the engine
 * writes. A definition the catalog does not call equipment leaves the record
 * with no gear to configure, whatever socket list it serializes.
 */
export const equipmentStateOf = (
	own: RecordGearState,
	definition: EquipmentCatalogEntry | undefined,
): Pick<
	InventoryDescriptionRecord,
	"equipment" | "socketCount" | "filledSockets"
> =>
	isEquipmentItem(definition)
		? {
				equipment: {
					refinement: own.refinement,
					canRefine: Boolean(definition.canRefine),
					refinementLevels: definition.refinementLevels ?? [0],
					unlockedSockets: own.unlockedSockets,
					socketCap: definition.socketCap ?? null,
					socketItems: own.socketItems,
				},
				socketCount: own.unlockedSockets,
				filledSockets: own.filledSockets,
			}
		: {
				equipment: null,
				// Such a record still serializes a socket list, and its length is what
				// the views count.
				socketCount: own.socketItems.length,
				filledSockets: own.filledSockets,
			};

export const describeInventory = async (
	save: DecodedSave,
): Promise<InventoryDescription> => {
	const catalog = await equipmentCatalog();
	const records: InventoryDescriptionRecord[] = [];
	for (const record of readInventory(save.rawPayload)) {
		const definition = catalog[String(record.itemKey)];
		records.push({
			inventoryKey: record.inventoryKey,
			// Item identities are uint64 and must not be rounded by JavaScript.
			itemNo: String(record.itemNo),
			itemKey: record.itemKey,
			slotNo: record.slotNo,
			quantity: record.stackCount,
			...equipmentStateOf(
				{
					refinement: Number(record.values._enchantLevel ?? 0),
					unlockedSockets: Number(record.values._validSocketCount ?? 0),
					socketItems: record.sockets.map((socket) => socket.itemKey ?? null),
					filledSockets: record.sockets.filter((socket) =>
						Boolean(socket.itemKey),
					).length,
				},
				definition,
			),
			noGearToEdit: Boolean(definition && !isEquipmentItem(definition)),
		});
	}
	return {
		containerVersion: save.header.version,
		payloadBytes: save.rawPayload.length,
		records,
	};
};

const whole = (value: unknown, label: string, minimum = 0): number => {
	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value < minimum
	) {
		throw new Error(`${label} must be a whole number of at least ${minimum}`);
	}
	return value;
};

type EditorEquipmentEdit = {
	type: "equipment";
	inventoryKey: number;
	slotNo: number;
	itemKey: number;
	refinement: number;
	unlockedSockets: number;
	socketItems: Array<number | null>;
};

type EditorInsertEquipmentEdit = {
	type: "insertEquipment";
	inventoryKey: number;
	itemKey: number;
	refinement: number;
	unlockedSockets?: number;
	socketItems?: Array<number | null>;
};

type EditorInsertCatalogItemEdit = {
	type: "insertCatalogItem";
	inventoryKey: number;
	itemKey: number;
	quantity: 1;
};

export type EquipmentChange =
	| EditorEquipmentEdit
	| EditorInsertEquipmentEdit
	| EditorInsertCatalogItemEdit;

export const applyEquipmentChange = async (
	source: Uint8Array,
	edit: EquipmentChange,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	if (edit.type === "insertEquipment" || edit.type === "equipment") {
		// Check the complete requested configuration, including unchanged sockets,
		// before constructing an item or applying any scalar/socket operations.
		const sockets: Array<number | null> = (edit.type === "insertEquipment"
			? edit.socketItems
			: edit.socketItems) ?? [null, null, null, null, null];
		if (!Array.isArray(sockets) || sockets.length !== 5) {
			throw new Error("Expected exactly five socket positions.");
		}
		for (const gearKey of sockets) {
			if (gearKey !== null && gearKey !== undefined) {
				await requireCompatibleGear(
					whole(edit.itemKey, "Equipment item", 1),
					whole(gearKey, "Abyss Gear", 1),
				);
			}
		}
	}

	if (edit.type === "insertCatalogItem") {
		const [inserted, audit] = await insertCatalogItem(source, {
			itemKey: whole(edit.itemKey, "Item", 1),
			inventoryKey: whole(edit.inventoryKey, "Storage"),
		});
		const [output, discovery] = await applyItemDiscovery(
			inserted,
			edit.itemKey,
		);
		return [
			output,
			{ ...audit, discovery, output_sha256: discovery.output_sha256 },
		];
	}

	if (edit.type === "insertEquipment") {
		const [inserted, audit] = await insertCatalogEquipment(source, {
			itemKey: whole(edit.itemKey, "Equipment item", 1),
			inventoryKey: whole(edit.inventoryKey, "Storage"),
			refinement: whole(edit.refinement, "Refinement"),
		});
		const definition = defined(
			(await equipmentCatalog())[String(edit.itemKey)],
			"equipment definition",
		);
		// Resolve the new slot internally, then configure it before returning any
		// output. A failed socket edit discards the entire in-memory addition.
		const [configured, changes] = await applyEquipmentChange(inserted, {
			type: "equipment",
			inventoryKey: edit.inventoryKey,
			slotNo: whole(audit.new_slot, "Slot"),
			itemKey: edit.itemKey,
			refinement: edit.refinement,
			unlockedSockets:
				edit.unlockedSockets ?? definition.initialUnlockedSockets ?? 0,
			socketItems: edit.socketItems ?? [null, null, null, null, null],
		});
		const [output, discovery] = await applyItemDiscovery(
			configured,
			edit.itemKey,
		);
		return [
			output,
			{
				...audit,
				equipment_changes: changes,
				discovery,
				output_sha256: await sha256Hex(output),
			},
		];
	}

	const target = {
		inventoryKey: whole(edit.inventoryKey, "Storage"),
		slotNo: whole(edit.slotNo, "Equipment slot"),
		itemKey: whole(edit.itemKey, "Item", 1),
	};
	const definition = (await equipmentCatalog())[String(target.itemKey)];
	if (!(definition?.characterEquipment || definition?.canRefine)) {
		throw new Error("This item is not supported equipment.");
	}
	const level = whole(edit.refinement, "Refinement");
	const unlocked = whole(edit.unlockedSockets, "Unlocked sockets");
	const sockets = edit.socketItems;
	if (!Array.isArray(sockets) || sockets.length !== 5) {
		throw new Error("Expected exactly five socket positions.");
	}
	const socketItems: Array<number | null> = sockets.map((value) =>
		value === null || value === undefined
			? null
			: whole(value, "Abyss Gear", 1),
	);
	// One write for the whole record: `setEquipment` owns the guards and pays a
	// single decode, commit and reopen however many fields change.
	return setEquipment(source, target, {
		refinement: level,
		unlockedSockets: unlocked,
		socketItems,
	});
};
