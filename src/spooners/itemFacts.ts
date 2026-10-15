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
	linked: "Included with",
	choices: "Choices",
	tillRequests: "Order notes",
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

const keywordValue = (keyword: Keyword): string =>
	String(keyword.value ?? keyword.name ?? "").replace(/^[A-Z]{2}::/, "");

export const allergens = (def: ItemDefinition | null): string[] =>
	(def?.keywords ?? [])
		.filter((keyword) => keyword.type === "AL")
		.map((keyword) => {
			const raw = keywordValue(keyword);
			return ALLERGEN_LABELS[raw.toLowerCase()] ?? raw;
		})
		.sort();

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

export const heatLevel = (def: ItemDefinition | null): number | null => {
	const keyword = (def?.keywords ?? []).find(
		(candidate) => candidate.type === "HL",
	);
	const level = Number(keyword?.value ?? 0);
	return Number.isFinite(level) && level > 0 ? level : null;
};

export const promos = (def: ItemDefinition | null): string[] =>
	(def?.keywords ?? [])
		.filter((keyword) => keyword.type === "PI")
		.map((keyword) => keywordValue(keyword))
		.filter(Boolean);

const CATEGORY_LABELS: Record<string, string> = {
	"Includes a drink": "Meal deal",
};

export const categoryLabel = (category: string | null): string | null =>
	category ? (CATEGORY_LABELS[category] ?? category) : null;

export const humanise = (value: string): string =>
	value
		.replace(/[_-]+/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.trim();

export const linkedNames = (def: ItemDefinition | null): string[] =>
	(def?.optionGroups?.linked ?? [])
		.map((option) => option.label ?? option.name ?? "")
		.filter(Boolean)
		.map((label) => categoryLabel(label) ?? label);

export const ageLabel = (def: ItemDefinition | null): string | null => {
	if (!def?.ageRestriction) {
		return null;
	}
	return `${def.ageRestriction}+`;
};

export const optionDiscount = (option: ItemOption): string | null => {
	const was = option.initialPrice;
	const now = option.price;
	if (now == null || was == null || was <= now) {
		return null;
	}
	const percent = Math.round(((was - now) / was) * 100);
	return `was ${was.toFixed(2)}${percent ? `, ${percent}% off` : ""}`;
};
