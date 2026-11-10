import generated from "./generated/names.json";

const ITEM_NAMES: Readonly<Record<string, string>> = generated.items;

export const CRYSTAL_ID = 0;

export const ESSENCE_IDS: readonly number[] = [295, 296, 297, 298];

export const GEM_IDS = Array.from(
	{ length: 692 - 620 + 1 },
	(_, index) => 620 + index,
);

export const itemName = (id: number): string => {
	if (id === CRYSTAL_ID) return "Crystals";
	return ITEM_NAMES[String(id)] ?? `Unknown item ${id}`;
};
