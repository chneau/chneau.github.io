/**
 * The cheat set a third-party item mod hands out, as one click.
 *
 * "THE ONE TRUE RING (AXIOM of GODS)" — uploaded to Crimson Desert Nexus as
 * "Ultimate Ring With Bonus Boots And Gloves" — is a PAZ patch over
 * `gamedata/binary/client/bin/iteminfo.pabg` and `characterinfo.pabg`, not a
 * save. It re-buffs a ring into a chest of Lv 15 stat buffs (attack, movement,
 * crit, climb and swim speed, 100% fire/ice/lightning resistance), carries its
 * author's "Ultimate Axiom" bracelet buff, and reworks five Abyss Gears.
 *
 * A save edit cannot grant any of those effects: the stats live in the game's
 * own item data, and the save only records which item key a slot holds. So this
 * set does the one thing a save editor can — it puts the gear into a storage,
 * configured as high as the game data allows, from where the installed mod's
 * numbers apply.
 *
 * The ring and the five Abyss Gears are the items the mod itself names. The
 * bracelet is the item its author's sibling mod ("The Ultimate Axiom buff",
 * Nexus 638) is described as buffing. Everything else — the second ring, the
 * earrings, the helm, chest, gloves, boots, cloak and necklace — is a catalog
 * pick, because neither archive names them: the mod ships compiled tables, and
 * accessories carry no stats, sockets or refinement in the generated catalog to
 * rank them by. They cover one item per equipment slot, taken from the Demian
 * plate family and the boss-drop accessory range, and are changed by editing
 * this list alone. Keys are pinned by `tests/cheat-gear.test.ts`, which also
 * runs the whole set through the engine.
 */

import { planAddition } from "@/lib/add-plan";
import type { EquipmentDetails } from "@/lib/equipment";
import {
	type CatalogItem,
	type InventoryRecord,
	storageName,
} from "@/lib/inventory";
import { maxEquipmentEdits } from "@/lib/max-equipment";
import {
	abyssGearRulesTable,
	type EquipmentCatalogEntry,
	equipmentCatalogTable,
	itemCatalogTable,
} from "@/lib/save-engine/data";
import type { SaveEdit } from "@/lib/staged-edits";

/** Sockets are serialized as five positions whether or not they are filled. */
const SOCKET_POSITIONS = 5;

/**
 * The storage the planner previews in. `maxEquipmentEdits` filters records by
 * inventory key and nothing else about it reaches the result, so the plan is
 * the same wherever the set is finally staged.
 */
const PLAN_INVENTORY = 0;

type CheatGearItem = {
	/** Catalog item key the preset stages. */
	itemKey: number;
	/** The name the catalog must carry it under. */
	label: string;
	/** What the item is doing in the set, for the button's description. */
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

/** One set item, resolved against the catalogs. */
type CheatGearPlan = {
	itemKey: number;
	itemName: string;
	/**
	 * Character gear goes through the equipment inserter, which takes a whole
	 * configuration; a plain item is inserted as a catalog record or a donor
	 * clone instead. `null` means the latter.
	 */
	equipment: EquipmentDetails | null;
};

/** Only the merged item table is read: names, categories and stack flags. */
type CheatGearCatalog = { items: Record<string, CatalogItem> } | null;

/** A record's item state as the catalog declares it, before any planning. */
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

/**
 * The highest configuration the game data allows, using the same planner as the
 * inventory's "Max Equipment" button: refinement to the item's own ceiling,
 * sockets to its own cap, filled with the strongest Abyss Gear that fits. An
 * item the planner leaves alone comes back native.
 */
const maxedDetails = (
	itemKey: number,
	definition: EquipmentCatalogEntry,
	rules: Awaited<ReturnType<typeof abyssGearRulesTable>>,
): EquipmentDetails => {
	const equipment = nativeDetails(definition);
	// The planner reads whole records; only this item's equipment matters, so
	// the rest of the envelope is filled with values it never looks at.
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

/** Every set item, resolved: character gear carries its maxed configuration. */
export const cheatGearPlans = async (): Promise<CheatGearPlan[]> => {
	const [items, equipment, rules] = await Promise.all([
		itemCatalogTable(),
		equipmentCatalogTable(),
		abyssGearRulesTable(),
	]);
	return cheatGearSet.map((gear) => {
		const definition = equipment.items[String(gear.itemKey)];
		if (!definition?.characterEquipment) {
			// A plain item keeps the name the item catalog knows it by.
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

/** What one set item could not be staged, and why. */
type CheatGearSkip = { label: string; reason: string };

/**
 * Stages the whole set into one storage.
 *
 * An item the storage already holds — or one already staged this session — is
 * left out rather than duplicated, because the engine refuses a second record
 * with the same item key in one inventory. Plain items go through the picker's
 * own add rule, so a storage that holds nothing stackable can only take the
 * character gear, and the skips say so.
 */
export const cheatGearEdits = async ({
	inventoryKey,
	records,
	catalog,
	staged = [],
}: {
	inventoryKey: number;
	/** The save's own records, before any staged edit was folded in. */
	records: InventoryRecord[];
	catalog: CheatGearCatalog;
	/** Edits already staged this session. */
	staged?: SaveEdit[];
}): Promise<{ edits: SaveEdit[]; skipped: CheatGearSkip[] }> => {
	const plans = await cheatGearPlans();
	const edits: SaveEdit[] = [];
	const skipped: CheatGearSkip[] = [];
	for (const plan of plans) {
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
			skipped.push({ label: plan.itemName, reason: planned.error });
			continue;
		}
		// The add rule grows a stack the storage already holds, which a preset must
		// not do: it stages one item per slot and says what it left alone.
		if (planned.edit.type === "quantity") {
			skipped.push({
				label: plan.itemName,
				reason: `already in ${storageName(inventoryKey)}`,
			});
			continue;
		}
		edits.push(planned.edit);
	}
	return { edits, skipped };
};
