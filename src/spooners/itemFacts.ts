/**
 * Human-readable facts decoded out of an item's keywords and option groups, so
 * every field the API keeps can be surfaced somewhere in the UI.
 */

import type { ItemDefinition, ItemOption, Keyword } from "./types";

type OptionGroup = {
	group: string;
	label: string;
	options: ItemOption[];
};

const GROUP_LABELS: Record<string, string> = {
	portion: "Portions",
	tags: "Tags & free extras",
	addOns: "Add-ons",
	linked: "Linked items",
	choices: "Choices",
	tillRequests: "Till requests",
	swap: "Swaps",
};

export const optionGroups = (def: ItemDefinition | null): OptionGroup[] =>
	Object.entries(def?.optionGroups ?? {}).map(([group, options]) => ({
		group,
		label: GROUP_LABELS[group] ?? group,
		options: options ?? [],
	}));

const ALLERGEN_LABELS: Record<string, string> = {
	gluten: "Gluten",
	sulpher: "Sulphites",
	milk: "Milk",
	egg: "Egg",
	mustard: "Mustard",
	soybeans: "Soy",
	fish: "Fish",
	crustaceans: "Crustaceans",
	celery: "Celery",
	peanuts: "Peanuts",
	"sesame seed": "Sesame",
};

const valueOf = (keyword: Keyword): string =>
	String(keyword.value ?? keyword.name ?? "").replace(/^[A-Z]{2}::/, "");

/** Allergens, e.g. "Gluten", "Milk". */
export const allergens = (def: ItemDefinition | null): string[] =>
	(def?.keywords ?? [])
		.filter((keyword) => keyword.type === "AL")
		.map((keyword) => {
			const raw = valueOf(keyword);
			return ALLERGEN_LABELS[raw.toLowerCase()] ?? raw;
		})
		.sort();

/** Vegan / Vegetarian / Under 500 kcal / Under 5% fat. */
export const dietary = (def: ItemDefinition | null): string[] =>
	(def?.keywords ?? [])
		.filter((keyword) =>
			["Vegan", "Vegetarian", "under500", "5fat"].includes(keyword.type ?? ""),
		)
		.map((keyword) => keyword.label ?? keyword.name ?? "")
		.filter(Boolean);

const ALE_COLOURS: Record<string, string> = {
	golden: "Golden",
	pale: "Pale",
	amber: "Amber",
	brown: "Brown",
	dark: "Dark",
};

/** Real-ale colour, e.g. "Pale ale". */
export const aleColour = (def: ItemDefinition | null): string | null => {
	const keyword = (def?.keywords ?? []).find((candidate) =>
		(candidate.type ?? "").startsWith("ale-"),
	);
	if (!keyword) {
		return null;
	}
	const tone = (keyword.type ?? "").slice(4);
	return `${ALE_COLOURS[tone] ?? tone} ale`;
};

/** Chilli heat level ("🌶 x2"), when the item declares one. */
export const heatLevel = (def: ItemDefinition | null): number | null => {
	const keyword = (def?.keywords ?? []).find(
		(candidate) => candidate.type === "HL",
	);
	const level = Number(keyword?.value ?? 0);
	return Number.isFinite(level) && level > 0 ? level : null;
};

/** Promotional tags, e.g. "new", "Airport", "Jan Sale". */
export const promos = (def: ItemDefinition | null): string[] =>
	(def?.keywords ?? [])
		.filter((keyword) => keyword.type === "PI")
		.map((keyword) => valueOf(keyword))
		.filter(Boolean);

/** Menus this item is bundled with, e.g. "Includes a drink". */
export const linkedNames = (def: ItemDefinition | null): string[] =>
	(def?.optionGroups?.linked ?? [])
		.map((option) => option.label ?? option.name ?? "")
		.filter(Boolean);

/** "18 years", or empty when there is no age restriction. */
export const ageLabel = (def: ItemDefinition | null): string | null => {
	if (!def?.ageRestriction) {
		return null;
	}
	return `${def.ageRestriction}+`;
};

/** Every keyword, raw, for the "all the data" table. */
export const rawKeywords = (def: ItemDefinition | null): Keyword[] =>
	def?.keywords ?? [];

/** "was £4.00, 20% off" for a discounted option, or null. */
export const optionDiscount = (option: ItemOption): string | null => {
	const was = option.initialPrice;
	const now = option.price;
	if (now == null || was == null || was <= now) {
		return null;
	}
	const percent = Math.round(((was - now) / was) * 100);
	return `was ${was.toFixed(2)}${percent ? `, ${percent}% off` : ""}`;
};
