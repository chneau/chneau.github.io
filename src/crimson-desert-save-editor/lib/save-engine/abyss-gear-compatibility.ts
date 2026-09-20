/**
 * TypeScript port of `public/python/editor/abyss_gear_compatibility.py`.
 */

import { type AbyssGearRulesFile, abyssGearRulesTable } from "./data";
import { loadItemCatalog } from "./item-catalog";

let rulesPromise: Promise<AbyssGearRulesFile> | undefined;

const compatibilityRules = (): Promise<AbyssGearRulesFile> => {
	rulesPromise ??= abyssGearRulesTable();
	return rulesPromise;
};

export const requireCompatibleGear = async (
	equipmentKey: number,
	gearKey: number,
): Promise<void> => {
	const rules = await compatibilityRules();
	const gear = rules.gear[String(gearKey)];
	const equipType = rules.equipmentTypes[String(equipmentKey)];
	if (!gear || !equipType) {
		throw new Error(
			"Abyss Gear compatibility is unknown for this item; choose supported equipment and gear.",
		);
	}
	if (!gear.allowedEquipTypes.includes(Number(equipType))) {
		const allowed =
			gear.allowedCategories.join(", ") || "No supported equipment";
		const catalog = await loadItemCatalog();
		throw new Error(
			`${catalog.getName(gearKey)} cannot be placed on ${catalog.getName(
				equipmentKey,
			)}. Compatible equipment: ${allowed}.`,
		);
	}
};
