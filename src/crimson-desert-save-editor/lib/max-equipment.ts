/**
 * "Max Equipment": take the equipment in one storage to the ceiling the game
 * data allows for each item, and fill its sockets with the strongest Abyss
 * Gear that fits.
 *
 * The ceiling is not a constant. Most equipment cannot be refined at all, so
 * the item's own `refinementLevels` are the limit; socket caps run from none to
 * five; and a socket only accepts gear whose `allowedEquipTypes` include the
 * item's equip type. The engine re-checks all of that on apply —
 * `applyEquipmentChange` refuses an unsupported refinement level, a relocked
 * socket, a removal, a duplicate and any gear the item cannot take — so this
 * planner is written to produce only payloads the engine accepts:
 *
 * - refinement stops at the item's own `refinementLevels`,
 * - sockets unlock up to the item's own `socketCap` and are never relocked,
 * - socketed Abyss Gear is never removed, only replaced by gear that fits,
 * - a socket keeps the gear it holds unless the plan can put something better
 *   there: a lower tier of the same family, or gear the item cannot take,
 * - no gear item is put into two sockets of the same equipment. Distinctness
 *   is about what this plan adds: a save can hold the same gear in two sockets
 *   already — the committed fixtures do — because the engine only rejects a
 *   duplicate when the socket itself is re-staged. Such a pair is left as it
 *   stands rather than one of them being rerolled or dropped.
 *
 * Tiers are compared within a family — `Item_Stat_AbyssGear_DDD_LV1` and its
 * `LV3` are the same family — so "… I" and "… II" are only ever used by a
 * family that has nothing higher. A family's top tier is `_Special` where one
 * exists, which is why a socket holding a "… III" is upgraded to "Greater …".
 */

import { canSocketGear } from "@/lib/abyss-gear";
import type { EquipmentDetails, EquipmentEdit } from "@/lib/equipment";
import type { InventoryRecord } from "@/lib/inventory";
import type { AbyssGearRulesFile } from "@/lib/save-engine/data";

/** The refinement ceiling the engine enforces, whatever the item's table says. */
const MAX_REFINEMENT = 10;

/** Sockets are serialized as five positions whether or not they are filled. */
const SOCKET_POSITIONS = 5;

/**
 * Ranks above every `_LVn` tier: `_Special` ("Greater …") and the unique named
 * drops, which carry no tier suffix at all. Gear the rules cannot name ranks
 * last, so an unclassified entry never displaces a classified one.
 */
const SPECIAL_TIER = 1000;

/**
 * The family a gear item belongs to: its identity with the tier suffix
 * stripped. Every `Item_Stat_AbyssGear_DDD_*` is one family, so the tiers
 * within it are what "always take the III" compares.
 */
const gearFamily = (internalName: string): string =>
	internalName.replace(/_(LV\d+|Special)$/i, "");

/** The tier within a family: `3` for `…_LV3`, `1000` for `_Special` or none. */
const gearTier = (internalName: string | undefined): number => {
	if (internalName === undefined) return 0;
	const tiered = /_LV(\d+)$/.exec(internalName);
	const level = tiered?.[1];
	return level === undefined ? SPECIAL_TIER : Number(level);
};

type Gear = { key: number; family: string; tier: number };

const describeGear = (rules: AbyssGearRulesFile): Gear[] =>
	Object.entries(rules.gear).map(([rawKey, entry]) => ({
		key: Number(rawKey),
		family: gearFamily(entry.internalName),
		tier: gearTier(entry.internalName),
	}));

/** The family of one gear key, as the rules name it. */
const gearFamilyOf = (
	rules: AbyssGearRulesFile,
	gearKey: number,
): string | undefined => {
	const internalName = rules.gear[String(gearKey)]?.internalName;
	return internalName === undefined ? undefined : gearFamily(internalName);
};

/**
 * The highest tier each family reaches. A family's lower tiers are dropped
 * from every ranking below: a "… I" or "… II" is only ever offered when its
 * family has no higher tier at all, which is the case for 51 of the 93
 * families.
 */
const bestTierByFamily = (gear: Gear[]): Map<string, number> => {
	const best = new Map<string, number>();
	for (const item of gear) {
		best.set(item.family, Math.max(best.get(item.family) ?? 0, item.tier));
	}
	return best;
};

/**
 * The Abyss Gear that fits `equipmentKey`, strongest first. Ties break on the
 * item key, so the same save always produces the same socket layout.
 */
const rankedFits = (
	rules: AbyssGearRulesFile,
	equipmentKey: number,
	gear: Gear[],
	best: Map<string, number>,
): number[] =>
	gear
		.filter((item) => item.tier === best.get(item.family))
		.filter((item) => canSocketGear(rules, equipmentKey, item.key))
		.sort((left, right) => right.tier - left.tier || left.key - right.key)
		.map((item) => item.key);

/** The five serialized socket positions, with absent ones as `null`. */
const socketList = (items: (number | null)[]): (number | null)[] =>
	Array.from({ length: SOCKET_POSITIONS }, (_, index) => items[index] ?? null);

type SocketPlan = { unlockedSockets: number; socketItems: (number | null)[] };

/**
 * How a socket the current build left empty gets filled.
 *
 * `strongest` walks the ranking from the top, so the same save always gets the
 * same layout. `random` picks uniformly from the same top-tier candidates
 * instead, for a build that varies — it still never reaches a family's lower
 * tiers, so a "… III" family can only ever contribute its III.
 */
type GearChoice = "strongest" | "random";

/**
 * The socket configuration to aim for, or `null` when sockets must be left
 * exactly as they are because the item's cap is unknown or it has no sockets.
 * A returned plan can still hold gear the item does not accept, when there is
 * nothing better to put in that socket and removal is not allowed; `applicable`
 * decides whether the result may be staged.
 *
 * A socketed item is only replaced when removing it is legal and something
 * better is available for that socket — a higher tier of the same family, or a
 * stronger family. Gear the item cannot take is not "better": it is only
 * displaced when there is a compatible replacement to put in its place.
 */
const socketPlan = (
	rules: AbyssGearRulesFile,
	equipmentKey: number,
	details: EquipmentDetails,
	ranked: number[],
	choice: GearChoice,
	random: () => number,
): SocketPlan | null => {
	const cap = details.socketCap;
	if (cap === null || cap === 0) return null;
	const current = socketList(details.socketItems);
	const unlockedSockets = Math.min(
		SOCKET_POSITIONS,
		Math.max(details.unlockedSockets, cap),
	);
	const socketItems = socketList(current);
	// A socket may keep the gear it already holds: the engine treats a socket
	// whose value is unchanged as untouched, so it never has to satisfy the
	// duplicate check. That is what lets a reroll draw freely — the saved item
	// stays a candidate for its own position instead of colliding with itself.
	const spare = ranked.slice();
	const taken = new Set<number>();
	const draw = (exclude: ReadonlySet<number>): number | undefined => {
		const open = spare.filter(
			(candidate) => !taken.has(candidate) && !exclude.has(candidate),
		);
		if (open.length === 0) return undefined;
		const chosen =
			choice === "random"
				? (open[Math.floor(random() * open.length)] as number)
				: (open[0] as number);
		taken.add(chosen);
		return chosen;
	};
	const better = (socketed: number, gearKey: number): boolean =>
		gearFamilyOf(rules, gearKey) === gearFamilyOf(rules, socketed) &&
		gearTier(rules.gear[String(gearKey)]?.internalName) >
			gearTier(rules.gear[String(socketed)]?.internalName);

	// `strongest` only moves a socket that can be improved, so a build is not
	// churned for no gain. `random` rerolls every unlocked position, which is
	// what makes a second press produce a second build.
	const positions: number[] = [];
	for (let index = 0; index < unlockedSockets; index++) {
		const socketed = socketItems[index] ?? null;
		if (choice === "random") {
			positions.push(index);
			continue;
		}
		if (socketed === null) {
			positions.push(index);
			continue;
		}
		// Gear the item cannot take is unusable where it sits, so any compatible
		// candidate is an improvement; otherwise only a higher tier of the same
		// family counts.
		const compatible = canSocketGear(rules, equipmentKey, socketed);
		if (
			compatible &&
			!spare.some(
				(candidate) => !taken.has(candidate) && better(socketed, candidate),
			)
		) {
			continue;
		}
		positions.push(index);
	}
	for (const index of positions) {
		const socketed = socketItems[index] ?? null;
		if (choice === "random") {
			// Draw a fresh item, never one another socket already received. If the
			// pool is exhausted, keep what was there rather than emptying it.
			const exclude = new Set(socketItems.filter((key) => key !== null));
			if (socketed !== null) exclude.delete(socketed);
			socketItems[index] = draw(exclude) ?? socketed ?? current[index] ?? null;
			continue;
		}
		const compatible =
			socketed !== null && canSocketGear(rules, equipmentKey, socketed);
		const exclude = new Set<number>();
		if (compatible && socketed !== null) exclude.add(socketed);
		const preferred =
			socketed === null
				? undefined
				: spare.find(
						(candidate) =>
							!taken.has(candidate) &&
							candidate !== socketed &&
							(compatible ? better(socketed, candidate) : true),
					);
		const chosen =
			preferred ??
			(socketed !== null && compatible
				? // Nothing better fits: keep the socketed item.
					socketed
				: draw(exclude));
		if (chosen !== undefined) taken.add(chosen);
		socketItems[index] = chosen ?? socketed ?? current[index] ?? null;
	}
	return { unlockedSockets, socketItems };
};

/**
 * Whether the engine takes this configuration as a change to `details`: sockets
 * only ever unlock, Abyss Gear is never removed, and no gear item a socket
 * receives duplicates *another socket that is also being re-staged*. The
 * engine's duplicate check is per replaced socket — it refuses a replacement
 * already present elsewhere — so a pair this plan creates is refused, while a
 * pair the save already held can stay: either neither socket moves, or both
 * do and no duplicate survives.
 */
const applicable = (details: EquipmentDetails, plan: SocketPlan): boolean => {
	if (plan.unlockedSockets < details.unlockedSockets) return false;
	const current = socketList(details.socketItems);
	const restaged = plan.socketItems
		.map((gearKey, index) =>
			gearKey === (current[index] ?? null) ? -1 : index,
		)
		.filter((index) => index >= 0);
	const seen = new Set<number>();
	return plan.socketItems.every((gearKey, index) => {
		if (gearKey === null) return (current[index] ?? null) === null;
		if (!seen.has(gearKey)) {
			seen.add(gearKey);
			return true;
		}
		// A duplicate is only a problem when this socket is being re-staged and
		// the copy it duplicates is left untouched: `replace_socket` re-checks
		// the whole item for the key and would refuse it.
		return (
			!restaged.includes(index) ||
			restaged.includes(plan.socketItems.indexOf(gearKey))
		);
	});
};

type MaxEquipmentPlan = {
	/** One staged edit per record that actually changes. */
	edits: EquipmentEdit[];
	/** Equipment records the plan looked at. */
	considered: number;
	/** Records whose refinement is raised. */
	refined: number;
	/** Sockets the plan ends up holding gear in, kept ones included. */
	socketed: number;
};

/**
 * Stage the maximum this storage's equipment supports. Records already at
 * their ceiling produce no edit, so the plan is idempotent: running it twice
 * stages the same thing once.
 *
 * `gear` chooses what fills an empty socket: `"strongest"` (the default) walks
 * the ranking, `"random"` varies the build without ever dropping to a family's
 * lower tier. `random` is the generator behind that choice, injectable so a
 * caller — or a test — can make the result reproducible.
 */
export const maxEquipmentEdits = ({
	records,
	inventoryKey,
	rules,
	itemNameFor,
	gear = "strongest",
	random = Math.random,
}: {
	/** The save's own records, before any staged edit was folded in. */
	records: InventoryRecord[];
	inventoryKey: number;
	rules: AbyssGearRulesFile;
	itemNameFor?: (itemKey: number) => string;
	/** How to fill a socket the current build left empty. */
	gear?: GearChoice;
	/** Source of randomness for `gear: "random"`. */
	random?: () => number;
}): MaxEquipmentPlan => {
	const edits: EquipmentEdit[] = [];
	const allGear = describeGear(rules);
	const best = bestTierByFamily(allGear);
	const rankedCache = new Map<number, number[]>();
	const rankedFor = (equipmentKey: number): number[] => {
		let ranked = rankedCache.get(equipmentKey);
		if (ranked === undefined) {
			ranked = rankedFits(rules, equipmentKey, allGear, best);
			rankedCache.set(equipmentKey, ranked);
		}
		return ranked;
	};
	let considered = 0;
	let refined = 0;
	let socketed = 0;
	for (const record of records) {
		if (record.inventoryKey !== inventoryKey) continue;
		const details = record.equipment;
		if (!details) continue;
		considered += 1;
		const current = socketList(details.socketItems);
		// The engine re-validates every socket the record already holds, so an
		// item whose equip type the rules do not know cannot be edited at all
		// once it carries gear. Leave those alone rather than stage a failure.
		if (
			rules.equipmentTypes[String(record.itemKey)] === undefined &&
			current.some((gearKey) => gearKey !== null)
		) {
			continue;
		}
		const levels = details.refinementLevels ?? [];
		const refinement =
			details.canRefine && levels.length > 0
				? Math.min(MAX_REFINEMENT, Math.max(...levels))
				: details.refinement;
		const plan = socketPlan(
			rules,
			record.itemKey,
			details,
			rankedFor(record.itemKey),
			gear,
			random,
		);
		const usable = plan !== null && applicable(details, plan) ? plan : null;
		const unlockedSockets = usable?.unlockedSockets ?? details.unlockedSockets;
		const socketItems = usable?.socketItems ?? current;
		const socketsChanged = socketItems.some(
			(gearKey, index) => gearKey !== (current[index] ?? null),
		);
		if (
			refinement === details.refinement &&
			unlockedSockets === details.unlockedSockets &&
			!socketsChanged
		) {
			continue;
		}
		if (refinement !== details.refinement) refined += 1;
		if (socketsChanged) {
			socketed += socketItems.filter((gearKey) => gearKey !== null).length;
		}
		edits.push({
			type: "equipment",
			inventoryKey: record.inventoryKey,
			slotNo: record.slotNo,
			itemKey: record.itemKey,
			itemName: itemNameFor?.(record.itemKey) ?? `Item ${record.itemKey}`,
			refinement,
			unlockedSockets,
			socketItems,
		});
	}
	return { edits, considered, refined, socketed };
};
