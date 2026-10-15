import { amount, currencySymbol } from "./price";
import type { ItemDefinition, ItemNature, ValueKind } from "./types";

type PortionKind =
	| "pint"
	| "half"
	| "glass"
	| "bottle"
	| "can"
	| "jug"
	| "pitcher"
	| "single"
	| "double"
	| "standard"
	| "measure"
	| "each"
	| "other";

const IMPLIED_ML: Record<PortionKind, number | null> = {
	pint: 568,
	half: 284,
	glass: null,
	bottle: null,
	can: null,
	jug: 1140,
	pitcher: 1140,
	single: 25,
	double: 50,
	standard: null,
	measure: null,
	each: null,
	other: null,
};

const CANONICAL_LABEL: Record<string, string> = {
	"half pint": "Half pint",
	"large pitcher": "Large pitcher",
	"small pitcher": "Small pitcher",
	"large jug": "Large jug",
	"small jug": "Small jug",
	pint: "Pint",
	half: "Half pint",
	single: "Single",
	double: "Double",
	standard: "Standard",
	each: "Each",
};

export const portionLabel = (label: string): string => {
	const low = label.trim().replace(/\s+/g, " ").toLowerCase();
	return CANONICAL_LABEL[low] ?? low;
};

const classifyPortion = (label: string): PortionKind => {
	const low = portionLabel(label).toLowerCase();
	if (low.includes("pint") && low.includes("half")) return "half";
	if (low.includes("half")) return "half";
	if (low.includes("pint")) return "pint";
	if (low.includes("pitcher")) return "pitcher";
	if (low.includes("jug")) return "jug";
	if (low.includes("glass")) return "glass";
	if (low.includes("bottle")) return "bottle";
	if (low.includes("can") || low.includes("tin")) return "can";
	if (low.includes("double")) return "double";
	if (low.includes("single")) return "single";
	if (low.includes("standard") || low.includes("measure")) return "standard";
	if (low === "each" || low.includes("portion")) return "each";
	return "other";
};

const portionMl = (label: string): number | null => {
	const match = /(\d+(?:\.\d+)?)\s*ml/.exec(portionLabel(label));
	if (match?.[1]) {
		return Number(match[1]);
	}
	return IMPLIED_ML[classifyPortion(label)];
};

const KIND_ORDER: PortionKind[] = [
	"pint",
	"half",
	"glass",
	"bottle",
	"can",
	"jug",
	"pitcher",
	"single",
	"standard",
	"double",
	"measure",
	"each",
	"other",
];

export const portionRank = (label: string): number => {
	const kind = classifyPortion(label);
	const index = KIND_ORDER.indexOf(kind);
	return (
		(index < 0 ? KIND_ORDER.length : index) * 1000 + (portionMl(label) ?? 0)
	);
};

const normalizePortions = (
	portions: Record<string, number>,
): Record<string, number> => {
	const out: Record<string, number> = {};
	for (const [label, price] of Object.entries(portions)) {
		const key = portionLabel(label);
		if (out[key] == null || price < out[key]) {
			out[key] = price;
		}
	}
	return out;
};

const NATURE_PATTERNS: Array<[ItemNature, RegExp]> = [
	[
		"wine",
		/wine|champagne|prosecco|spumante|rioja|merlot|sauvignon|shiraz|malbec|chardonnay|pinot|zinfandel|rosé|rose|port\b|sherry|cava|bordeaux|côtes|cotes/i,
	],
	[
		"spirit",
		/spirit|whisk|liqueur|vodka|gin\b|rum\b|brandy|tequila|cognac|sambuca|chambord|malibu|kahl|triple sec|amaretto|bourbon|scotch|mezcal|aperol|campari|smirnoff|absolut|jameson|jack daniel|gordon'?s|tanqueray|bacardi|captain morgan|havana|hennessy|rémy|remy|glenfiddich|glenlivet|macallan|famous grouse|bell'?s|jim beam|bulleit|wild turkey|patr[oó]n|olmeca|jose cuervo|baileys|archers|tia maria|pimm'?s|martini|cinzano|disaronno|j[äa]germeister|ouzo|limoncello|grand marnier|cointreau|midori/i,
	],
	[
		"beer",
		/beer|ale\b|ales\b|lager|stout|cider|pilsner|ipa\b|bitter|porter|guinness|draught|craft|pale ale|perry|mead|seltzer|budweiser|bud light|heineken|beck'?s|corona|peroni|san miguel|stella|carlsberg|foster'?s|coors|amstel|birra|moretti|asahi|tiger|singha|estrella|leffe|hoegaarden|abbot|doom bar|landlord|london pride|john smith|speckled hen|ruddles|bishop'?s finger|spitfire|bombardier|wainwright|pedigree|timothy taylor|l[oö]wenbr[äa]u|paulaner|augustiner|weihenstephan|brooklyn|lagunitas|sierra nevada|brewdog|punk ipa|magic rock|shipyard|hobgoblin|old rosie|black dragon|stowford|westons|thatchers|aspall|strongbow|magners|bulmers|kopparberg|rekorderlig|old mout/i,
	],
	[
		"soft",
		/soft|cola|lemonade|juice|water|coffee|tea\b|chocolate|smoothie|milkshake|fizzy|tonic|squash|cordial|mocktail|soda|frappe|latte|americano|cappuccino|nectar|pepsi|fanta|sprite|7up|orangina|j2o|robinson|innocent|cawston|belvoir|schweppes|ribena|vimto|irn[- ]?bru|bovril/i,
	],
	[
		"food",
		/food|burger|chips|meal|breakfast|dessert|cake|sandwich|salad|pizza|curry|wrap|wing|starter|main|pudding|snack|bites|side|platter|bowl|fries|toast|pie\b|pasta|noodles|rice|chicken|beef|pork|fish|vegetarian|vegan|peanut|nuts?\b|crisps|popcorn|olives|nibbles|onion rings|garlic bread/i,
	],
];

export const itemNature = (definition: ItemDefinition | null): ItemNature => {
	if (!definition) {
		return "other";
	}
	const haystack = [
		definition.menu,
		definition.category,
		definition.name,
		...(definition.keywords ?? []).map((keyword) => keyword.name),
	]
		.filter(Boolean)
		.join(" ");
	for (const [nature, pattern] of NATURE_PATTERNS) {
		if (pattern.test(haystack)) {
			return nature;
		}
	}
	return definition.menu?.toLowerCase() === "food" ? "food" : "other";
};

const NATURE_KINDS: Record<ItemNature, PortionKind[]> = {
	beer: ["pint", "half", "bottle", "can", "jug", "pitcher"],
	wine: ["glass", "bottle", "other"],
	spirit: ["single", "standard", "double", "measure"],
	soft: ["bottle", "can", "pint", "half", "glass", "each"],
	food: ["each", "other"],
	other: [
		"pint",
		"half",
		"single",
		"standard",
		"double",
		"glass",
		"bottle",
		"can",
		"each",
		"other",
	],
};

const choosePrice = (
	portions: Record<string, number>,
	requested: string | null,
	nature: ItemNature,
): { portion: string; price: number } | null => {
	const normalised = normalizePortions(portions);
	const entries = Object.entries(normalised);
	if (!entries.length) {
		return null;
	}
	if (requested) {
		const exact = normalised[portionLabel(requested)];
		if (exact != null) {
			return { portion: portionLabel(requested), price: exact };
		}
		return null;
	}
	const preferredKinds = NATURE_KINDS[nature];
	const preferredKindSet = new Set(preferredKinds);
	const preferred = entries.filter(([label]) =>
		preferredKindSet.has(classifyPortion(label)),
	);
	const pool = preferred.length ? preferred : entries;
	pool.sort((a, b) => portionRank(a[0]) - portionRank(b[0]) || b[1] - a[1]);
	const first = pool[0] ?? entries[0];
	if (!first) {
		return null;
	}
	const [portion, price] = first;
	return { portion, price };
};

const parseVolumeMl = (
	description: string | null | undefined,
): number | null => {
	const match = /(\d{2,4})\s*ml\b/i.exec(description ?? "");
	if (!match?.[1]) {
		return null;
	}
	const value = Number(match[1]);
	return value > 0 ? value : null;
};

const parseAbv = (description: string | null | undefined): number | null => {
	const match = /([\d.]+)\s*%\s*(?:abv|alc\b|vol)?/i.exec(description ?? "");
	if (!match?.[1]) {
		return null;
	}
	const value = Number(match[1]);
	return value > 0 && value < 100 ? value : null;
};

const parseUnits = (description: string | null | undefined): number | null => {
	const match = /([\d.]+)\s*units?\b/i.exec(description ?? "");
	if (!match?.[1]) {
		return null;
	}
	const value = Number(match[1]);
	return value > 0 ? value : null;
};

type Value = { kind: ValueKind; value: number };

type DescriptionFacts = {
	abv: number | null;
	units: number | null;
	volumeMl: number | null;
	calories: number | null;
};

const EMPTY_FACTS: DescriptionFacts = {
	abv: null,
	units: null,
	volumeMl: null,
	calories: null,
};

const FACTS_CACHE = new WeakMap<ItemDefinition, DescriptionFacts>();

const describe = (definition: ItemDefinition | null): DescriptionFacts => {
	if (!definition) {
		return EMPTY_FACTS;
	}
	const cached = FACTS_CACHE.get(definition);
	if (cached) {
		return cached;
	}
	const facts: DescriptionFacts = {
		abv: parseAbv(definition.description),
		units: parseUnits(definition.description),
		volumeMl: parseVolumeMl(definition.description),
		calories: definition.calories ?? null,
	};
	FACTS_CACHE.set(definition, facts);
	return facts;
};

const computeValue = (input: {
	nature: ItemNature;
	price: number;
	abv: number | null;
	ml: number | null;
	calories: number | null;
	descriptionUnits: number | null;
}): Value | null => {
	const { nature, price, abv, ml, calories, descriptionUnits } = input;
	if (!price) {
		return null;
	}
	const unitsFromVolume = abv != null && ml != null ? (abv * ml) / 1000 : null;
	if (nature === "spirit") {
		const units = unitsFromVolume ?? null;
		return units && units > 0 ? { kind: "unit", value: price / units } : null;
	}
	if (unitsFromVolume && unitsFromVolume > 0) {
		return { kind: "unit", value: price / unitsFromVolume };
	}
	if (nature === "beer" || nature === "wine" || nature === "soft") {
		if (ml) {
			return { kind: "volume", value: price / (ml / 100) };
		}
		if (descriptionUnits && descriptionUnits > 0) {
			return { kind: "unit", value: price / descriptionUnits };
		}
	}
	if (calories && calories > 0) {
		return { kind: "calorie", value: calories / price };
	}
	if (ml) {
		return { kind: "volume", value: price / (ml / 100) };
	}
	if (descriptionUnits && descriptionUnits > 0) {
		return { kind: "unit", value: price / descriptionUnits };
	}
	return null;
};

export const valueDirection = (kind: ValueKind): 1 | -1 =>
	kind === "calorie" ? -1 : 1;

type ItemValue = {
	portion: string;
	price: number;
	value: Value | null;
};

export const pickItemValue = (
	portions: Record<string, number>,
	definition: ItemDefinition | null,
): ItemValue | null => {
	const nature = itemNature(definition);
	const picked = choosePrice(portions, null, nature);
	if (!picked) {
		return null;
	}
	const facts = describe(definition);
	const kind = classifyPortion(picked.portion);
	const ml =
		portionMl(picked.portion) ??
		(kind === "bottle" || kind === "can" || kind === "glass"
			? facts.volumeMl
			: null);
	return {
		portion: picked.portion,
		price: picked.price,
		value: computeValue({
			nature,
			price: picked.price,
			abv: facts.abv,
			ml,
			calories: facts.calories,
			descriptionUnits: facts.units,
		}),
	};
};

export const metricText = (value: Value, currency = "GBP"): string => {
	if (value.kind === "unit") {
		return `${currencySymbol(currency)}${amount(
			value.value,
			currency,
		)} / alcohol unit`;
	}
	if (value.kind === "volume") {
		return `${currencySymbol(currency)}${amount(
			value.value,
			currency,
		)} / 100 ml`;
	}
	return `${Math.round(value.value)} kcal / ${currencySymbol(currency)}`;
};
