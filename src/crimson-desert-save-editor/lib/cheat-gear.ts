import { planAddition, storageKeys } from "./add-plan";
import type { EquipmentDetails } from "./equipment";
import {
	type CatalogItem,
	type InventoryRecord,
	storageName,
} from "./inventory";
import { maxEquipmentEdits } from "./max-equipment";
import {
	abyssGearRulesTable,
	type EquipmentCatalogEntry,
	equipmentCatalogTable,
	itemCatalogTable,
} from "./save-engine/data";
import type { SaveEdit } from "./staged-edits";

const SOCKET_POSITIONS = 5;

const PLAN_INVENTORY = 0;

type CheatGearItem = {
	itemKey: number;
	label: string;
	note: string;
};

const ABYSS_GEAR_NOTE = "Abyss Gear the mod keeps from the grind.";

export const cheatGearSet: CheatGearItem[] = [
	{
		itemKey: 1000269,
		label: "Dev_Speed_Ring",
		note: "The ring the mod re-buffs with its Lv 15 speed, crit and resistance buffs.",
	},
	{
		itemKey: 8506,
		label: "Witch's Ring",
		note: "Second ring slot: an Abyss-reward ring from the witches who embed Abyss Gear.",
	},
	{
		itemKey: 8504,
		label: "Earring of Dark Magic",
		note: "Earring slot: a unique named drop.",
	},
	{
		itemKey: 391518540,
		label: "Witch's Earring",
		note: "Second earring slot.",
	},
	{
		itemKey: 1000842,
		label: "Executioner of Darkness Plate Helm",
		note: "Helm slot: the same Demian plate set as the boots and gloves.",
	},
	{
		itemKey: 1000013,
		label: "Official Knight's Plate Armor",
		note: "Chest slot: the same plate family, whose chest piece carries a different name.",
	},
	{
		itemKey: 14300,
		label: "Executioner of Darkness Plate Gloves",
		note: "Gloves: two sockets and refinement to 10.",
	},
	{
		itemKey: 14200,
		label: "Executioner of Darkness Plate Boots",
		note: "Boots: two sockets and refinement to 10.",
	},
	{
		itemKey: 1000686,
		label: "Executioner of Darkness Plate Cloak",
		note: "Cloak slot: the same Demian plate set.",
	},
	{
		itemKey: 391518546,
		label: "Ancient's Necklace",
		note: "Necklace slot: a boss-tier named drop.",
	},
	{
		itemKey: 1001129,
		label: "Axiom Bracelet",
		note: "The item the author's Ultimate Axiom mod buffs - the buff this ring mod combines.",
	},
	{
		itemKey: 1002583,
		label: "Karmic Pulse",
		note: ABYSS_GEAR_NOTE,
	},
	{
		itemKey: 1002592,
		label: "Hound's Claws",
		note: ABYSS_GEAR_NOTE,
	},
	{
		itemKey: 1002658,
		label: "Crescent Moon Slash",
		note: ABYSS_GEAR_NOTE,
	},
	{
		itemKey: 1002659,
		label: "Half Moon Slash",
		note: ABYSS_GEAR_NOTE,
	},
	{
		itemKey: 1002660,
		label: "Fullmoon Slash",
		note: ABYSS_GEAR_NOTE,
	},
];

type CheatGearPlan = {
	itemKey: number;
	itemName: string;
	equipment: EquipmentDetails | null;
};

type CheatGearCatalog = { items: Record<string, CatalogItem> } | null;

const nativeDetails = (
	definition: EquipmentCatalogEntry,
): EquipmentDetails => ({
	refinement: 0,
	canRefine: definition.canRefine,
	refinementLevels: definition.refinementLevels,
	unlockedSockets: definition.initialUnlockedSockets,
	socketCap: definition.socketCap,
	socketItems: Array.from({ length: SOCKET_POSITIONS }, () => null),
});

const maxedDetails = (
	itemKey: number,
	definition: EquipmentCatalogEntry,
	rules: Awaited<ReturnType<typeof abyssGearRulesTable>>,
): EquipmentDetails => {
	const equipment = nativeDetails(definition);
	const record: InventoryRecord = {
		inventoryKey: PLAN_INVENTORY,
		itemNo: 0,
		itemKey,
		slotNo: 0,
		quantity: 1,
		socketCount: equipment.unlockedSockets,
		filledSockets: 0,
		equipment,
	};
	const { edits } = maxEquipmentEdits({
		records: [record],
		inventoryKey: PLAN_INVENTORY,
		rules,
		itemNameFor: () => definition.name,
	});
	const edit = edits[0];
	return edit
		? {
				...equipment,
				refinement: edit.refinement,
				unlockedSockets: edit.unlockedSockets,
				socketItems: edit.socketItems,
			}
		: equipment;
};

export const cheatGearPlans = async (): Promise<CheatGearPlan[]> => {
	const [items, equipment, rules] = await Promise.all([
		itemCatalogTable(),
		equipmentCatalogTable(),
		abyssGearRulesTable(),
	]);
	return cheatGearSet.map((gear) => {
		const definition = equipment.items[String(gear.itemKey)];
		if (!definition?.characterEquipment) {
			const item = items.items[String(gear.itemKey)];
			return {
				itemKey: gear.itemKey,
				itemName: definition?.name ?? item?.name ?? gear.label,
				equipment: null,
			};
		}
		return {
			itemKey: gear.itemKey,
			itemName: definition.name,
			equipment: maxedDetails(gear.itemKey, definition, rules),
		};
	});
};

type CheatGearSkip = {
	label: string;
	reason: string;
	existing: boolean;
	wasStaged: boolean;
};

const held = (label: string, reason: string): CheatGearSkip => ({
	label,
	reason,
	existing: true,
	wasStaged: false,
});

const queued = (label: string, reason: string): CheatGearSkip => ({
	label,
	reason,
	existing: false,
	wasStaged: true,
});

export const cheatGearEdits = async ({
	inventoryKey,
	records,
	catalog,
	staged = [],
}: {
	inventoryKey: number;
	records: InventoryRecord[];
	catalog: CheatGearCatalog;
	staged?: SaveEdit[];
}): Promise<{ edits: SaveEdit[]; skipped: CheatGearSkip[] }> => {
	const plans = await cheatGearPlans();
	const { held: inStorage, staged: queuedKeys } = storageKeys({
		records,
		edits: staged,
		inventoryKey,
	});
	const edits: SaveEdit[] = [];
	const skipped: CheatGearSkip[] = [];
	for (const plan of plans) {
		if (queuedKeys.has(plan.itemKey)) {
			skipped.push(
				queued(
					plan.itemName,
					`already staged for ${storageName(inventoryKey)}`,
				),
			);
			continue;
		}
		if (inStorage.has(plan.itemKey)) {
			skipped.push(
				held(plan.itemName, `already in ${storageName(inventoryKey)}`),
			);
			continue;
		}
		if (plan.equipment) {
			edits.push({
				type: "insertEquipment",
				inventoryKey,
				itemKey: plan.itemKey,
				itemName: plan.itemName,
				refinement: plan.equipment.refinement,
				unlockedSockets: plan.equipment.unlockedSockets,
				socketItems: plan.equipment.socketItems,
				equipment: plan.equipment,
			});
			continue;
		}
		const planned = planAddition({
			records,
			catalog,
			edits: staged,
			inventoryKey,
			itemKey: plan.itemKey,
			quantity: 1,
		});
		if ("error" in planned) {
			skipped.push({
				label: plan.itemName,
				reason: planned.error,
				existing: false,
				wasStaged: false,
			});
			continue;
		}
		edits.push(planned.edit);
	}
	return { edits, skipped };
};
