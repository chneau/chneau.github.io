import { canSocketGear } from "./abyss-gear";
import type { EquipmentDetails, EquipmentEdit } from "./equipment";
import type { InventoryRecord } from "./inventory";
import type { AbyssGearRulesFile } from "./save-engine/data";

const MAX_REFINEMENT = 10;

const SOCKET_POSITIONS = 5;

const SPECIAL_TIER = 1000;

const gearFamily = (internalName: string): string =>
	internalName.replace(/_(LV\d+|Special)$/i, "");

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

const gearFamilyOf = (
	rules: AbyssGearRulesFile,
	gearKey: number,
): string | undefined => {
	const internalName = rules.gear[String(gearKey)]?.internalName;
	return internalName === undefined ? undefined : gearFamily(internalName);
};

const bestTierByFamily = (gear: Gear[]): Map<string, number> => {
	const best = new Map<string, number>();
	for (const item of gear) {
		best.set(item.family, Math.max(best.get(item.family) ?? 0, item.tier));
	}
	return best;
};

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

const socketList = (items: (number | null)[]): (number | null)[] =>
	Array.from({ length: SOCKET_POSITIONS }, (_, index) => items[index] ?? null);

type SocketPlan = { unlockedSockets: number; socketItems: (number | null)[] };

type GearChoice = "strongest" | "random";

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
			preferred ?? (socketed !== null && compatible ? socketed : draw(exclude));
		if (chosen !== undefined) taken.add(chosen);
		socketItems[index] = chosen ?? socketed ?? current[index] ?? null;
	}
	return { unlockedSockets, socketItems };
};

const applicable = (details: EquipmentDetails, plan: SocketPlan): boolean => {
	if (plan.unlockedSockets < details.unlockedSockets) return false;
	const current = socketList(details.socketItems);
	const restaged = new Set<number>();
	const firstSighting = new Map<number, number>();
	for (const [index, gearKey] of plan.socketItems.entries()) {
		if (gearKey !== null && !firstSighting.has(gearKey)) {
			firstSighting.set(gearKey, index);
		}
		if (gearKey !== (current[index] ?? null)) restaged.add(index);
	}
	const seen = new Set<number>();
	return plan.socketItems.every((gearKey, index) => {
		if (gearKey === null) return (current[index] ?? null) === null;
		if (!seen.has(gearKey)) {
			seen.add(gearKey);
			return true;
		}
		const first = firstSighting.get(gearKey);
		return !restaged.has(index) || (first !== undefined && restaged.has(first));
	});
};

type MaxEquipmentPlan = {
	edits: EquipmentEdit[];
	considered: number;
	refined: number;
	socketed: number;
};

export const maxEquipmentEdits = ({
	records,
	inventoryKey,
	rules,
	itemNameFor,
	gear = "strongest",
	random = Math.random,
}: {
	records: InventoryRecord[];
	inventoryKey: number;
	rules: AbyssGearRulesFile;
	itemNameFor?: (itemKey: number) => string;
	gear?: GearChoice;
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
