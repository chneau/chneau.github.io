import { describe, expect, test } from "bun:test";
import {
	itemNature,
	metricText,
	pickItemValue,
	portionLabel,
	portionRank,
	valueDirection,
} from "../portions";
import type { ItemDefinition } from "../types";

const definition = (overrides: Partial<ItemDefinition>): ItemDefinition => ({
	id: 1,
	name: "Test item",
	description: null,
	calories: null,
	itemType: null,
	ageRestriction: null,
	category: null,
	menu: null,
	keywords: [],
	optionGroups: {},
	...overrides,
});

describe("portionLabel canonicalises the labels the API spells inconsistently", () => {
	test("'Half Pint' becomes 'Half pint'", () => {
		expect(portionLabel("Half Pint")).toBe("Half pint");
	});

	test("'750ml Bottle' becomes '750ml bottle'", () => {
		expect(portionLabel("750ml Bottle")).toBe("750ml bottle");
	});

	test("every case variant of a label folds onto one spelling", () => {
		expect(portionLabel("pint")).toBe("Pint");
		expect(portionLabel("PINT")).toBe("Pint");
		expect(portionLabel("Half pint")).toBe("Half pint");
		expect(portionLabel("single")).toBe("Single");
		expect(portionLabel("large pitcher")).toBe("Large pitcher");
	});

	test("'half' is an alias of 'half pint', not a third format", () => {
		expect(portionLabel("half")).toBe(portionLabel("Half pint"));
	});

	test("surrounding and repeated whitespace is collapsed", () => {
		expect(portionLabel("  Half   Pint  ")).toBe("Half pint");
	});

	test("a label with no canonical spelling is lowercased and trimmed", () => {
		expect(portionLabel("  330ml CAN ")).toBe("330ml can");
		expect(portionLabel("200ml Bottle")).toBe("200ml bottle");
	});
});

describe("the canonical portion is chosen by what the venue actually sells", () => {
	test("a wine venue selling only a 750ml bottle picks the bottle", () => {
		const picked = pickItemValue(
			{ "750ml Bottle": 14 },
			definition({ name: "Merlot", menu: "Wine" }),
		);
		expect(picked?.portion).toBe("750ml bottle");
		expect(picked?.price).toBe(14);
	});

	test("a wine venue selling a glass prefers the glass over the bottle", () => {
		const picked = pickItemValue(
			{ "175ml Glass": 5.5, "750ml bottle": 14 },
			definition({ name: "Merlot", menu: "Wine" }),
		);
		expect(picked?.portion).toBe("175ml glass");
		expect(picked?.price).toBe(5.5);
	});

	test("a beer venue prefers a pint over a bottle and a can", () => {
		const picked = pickItemValue(
			{ Pint: 4.5, "330ml can": 3.2, Bottle: 5 },
			definition({ name: "Lager", menu: "Beer" }),
		);
		expect(picked?.portion).toBe("Pint");
		expect(picked?.price).toBe(4.5);
	});

	test("a spirit venue prefers a single over a double", () => {
		const picked = pickItemValue(
			{ Double: 6, Single: 3 },
			definition({ name: "Gin", menu: "Spirits" }),
		);
		expect(picked?.portion).toBe("Single");
		expect(picked?.price).toBe(3);
	});

	test("a venue selling only formats outside its nature's list still resolves", () => {
		const picked = pickItemValue(
			{ "330ml can": 3.2 },
			definition({ name: "Guinness", menu: "Beer" }),
		);
		expect(picked?.portion).toBe("330ml can");
		expect(picked?.price).toBe(3.2);
	});

	test("no portions at all resolves to null rather than a zero price", () => {
		expect(
			pickItemValue({}, definition({ name: "Gin", menu: "Spirits" })),
		).toBeNull();
	});
});

describe("normalisation keeps the cheaper of two case variants", () => {
	test("the cheaper spelling wins whichever order the rows arrive in", () => {
		expect(
			pickItemValue({ Pint: 5, pint: 4 }, definition({ name: "Lager" })),
		).toMatchObject({ portion: "Pint", price: 4 });
		expect(
			pickItemValue({ pint: 4, Pint: 5 }, definition({ name: "Lager" })),
		).toMatchObject({ portion: "Pint", price: 4 });
	});

	test("'Half pint' and 'half' collapse to the cheaper 284ml price", () => {
		const picked = pickItemValue(
			{ "Half pint": 2.8, half: 2.5 },
			definition({ name: "Lager", menu: "Beer" }),
		);
		expect(picked?.portion).toBe("Half pint");
		expect(picked?.price).toBe(2.5);
	});

	test("the de-duplicated price is the one the value metric is computed from", () => {
		const deduplicated = pickItemValue(
			{ Pint: 5, pint: 4 },
			definition({ name: "Lager", menu: "Beer" }),
		);
		const outright = pickItemValue(
			{ Pint: 4 },
			definition({ name: "Lager", menu: "Beer" }),
		);
		expect(deduplicated?.value).toEqual(outright?.value);
	});
});

describe("pickItemValue derives a comparable metric", () => {
	test("a 5% 330ml can is priced per alcohol unit", () => {
		const picked = pickItemValue(
			{ "330ml can": 3.3 },
			definition({
				name: "Lager",
				menu: "Beer",
				description: "5% ABV, 330ml can",
			}),
		);
		expect(picked?.value?.kind).toBe("unit");
		expect(picked?.value?.value).toBeCloseTo(3.3 / 1.65, 10);
	});

	test("the ml is read from the portion label when the description omits it", () => {
		const inLabel = pickItemValue(
			{ "330ml can": 3.3 },
			definition({ name: "Lager", menu: "Beer", description: "5% ABV" }),
		);
		expect(inLabel?.value?.value).toBeCloseTo(2, 10);
	});

	test("a spirit with no ABV has no value, rather than a volume metric", () => {
		const picked = pickItemValue(
			{ Single: 3 },
			definition({ name: "Gin", menu: "Spirits", description: "Gin" }),
		);
		expect(picked).not.toBeNull();
		expect(picked?.portion).toBe("Single");
		expect(picked?.price).toBe(3);
		expect(picked?.value).toBeNull();
	});

	test("the same portion on a soft drink does fall back to a volume metric", () => {
		const picked = pickItemValue(
			{ Single: 3 },
			definition({ name: "Cola", menu: "Soft drinks" }),
		);
		expect(picked?.value?.kind).toBe("volume");
		expect(picked?.value?.value).toBeCloseTo(12, 10);
	});

	test("a spirit with a stated ABV does get a unit metric", () => {
		const picked = pickItemValue(
			{ Single: 3 },
			definition({ name: "Gin", menu: "Spirits", description: "40% ABV" }),
		);
		expect(picked?.value?.kind).toBe("unit");
		expect(picked?.value?.value).toBeCloseTo(3, 10);
	});

	test("an alcohol-free drink falls back to price per 100ml", () => {
		const picked = pickItemValue(
			{ "330ml can": 1.5 },
			definition({ name: "Cola", menu: "Soft drinks" }),
		);
		expect(picked?.value?.kind).toBe("volume");
		expect(picked?.value?.value).toBeCloseTo(1.5 / 3.3, 10);
	});

	test("food is ranked on calories per pound, where higher is better", () => {
		const picked = pickItemValue(
			{ Each: 5 },
			definition({ name: "Chips", menu: "Food", calories: 500 }),
		);
		expect(picked?.value?.kind).toBe("calorie");
		expect(picked?.value?.value).toBeCloseTo(100, 10);
		expect(valueDirection(picked?.value?.kind ?? "unit")).toBe(-1);
	});

	test("units written in a description are used when the volume is unknown", () => {
		const picked = pickItemValue(
			{ "275ml can": 1.2 },
			definition({
				name: "Cola",
				menu: "Soft drinks",
				description: "1.7 units",
			}),
		);
		expect(picked?.value?.kind).toBe("volume");
	});

	test("a free portion has no metric rather than a division by zero", () => {
		const picked = pickItemValue(
			{ Single: 0 },
			definition({ name: "Gin", menu: "Spirits", description: "40% ABV" }),
		);
		expect(picked?.value).toBeNull();
	});

	test("an item with no description still prices, with no metric", () => {
		const picked = pickItemValue(
			{ Single: 3 },
			definition({ name: "Gin", menu: "Spirits" }),
		);
		expect(picked?.price).toBe(3);
		expect(picked?.value).toBeNull();
	});
});

describe("portionRank orders the portion switcher", () => {
	test("pints come before halves, which come before bottles", () => {
		expect(portionRank("Pint")).toBeLessThan(portionRank("Half pint"));
		expect(portionRank("Half pint")).toBeLessThan(portionRank("750ml bottle"));
	});

	test("a known volume breaks the tie within one kind", () => {
		expect(portionRank("175ml glass")).toBeLessThan(portionRank("250ml glass"));
	});

	test("an unrecognised label still ranks, after every known kind", () => {
		expect(portionRank("Mystery pour")).toBeGreaterThan(portionRank("Each"));
	});
});

describe("itemNature reads the whole definition", () => {
	test("a null definition is 'other', not a guess", () => {
		expect(itemNature(null)).toBe("other");
	});

	test("the category is consulted when the name is uninformative", () => {
		expect(itemNature(definition({ name: "Merlot", menu: "Wine" }))).toBe(
			"wine",
		);
		expect(itemNature(definition({ name: "G&T", menu: "Spirits" }))).toBe(
			"spirit",
		);
		expect(itemNature(definition({ name: "Lager", menu: "Beer" }))).toBe(
			"beer",
		);
	});

	test("a keyword can carry the nature when nothing else does", () => {
		expect(
			itemNature(
				definition({
					name: "Number 4",
					keywords: [{ type: "style", name: "IPA" }],
				}),
			),
		).toBe("beer");
	});

	test("nature precedence is fixed: a spirit sold as 'ale' is still a spirit", () => {
		expect(
			itemNature(definition({ name: "Vodka Martini", category: "ale" })),
		).toBe("spirit");
	});

	test("an item nothing matches is 'other' unless its menu says food", () => {
		expect(itemNature(definition({ name: "Mystery pie" }))).toBe("food");
		expect(itemNature(definition({ name: "Mystery", menu: "Drinks" }))).toBe(
			"other",
		);
	});
});

describe("metricText renders each metric kind", () => {
	test("a unit metric names the alcohol unit", () => {
		expect(metricText({ kind: "unit", value: 1.5 })).toBe(
			"£1.50 / alcohol unit",
		);
	});

	test("a volume metric names the 100ml divisor", () => {
		expect(metricText({ kind: "volume", value: 1.5 })).toBe("£1.50 / 100 ml");
	});

	test("a calorie metric is rounded and states the pound", () => {
		expect(metricText({ kind: "calorie", value: 99.6 })).toBe("100 kcal / £");
	});

	test("a non-GBP metric uses that currency's symbol", () => {
		expect(metricText({ kind: "unit", value: 1.5 }, "EUR")).toBe(
			"€1.50 / alcohol unit",
		);
	});

	test("valueDirection is -1 only for calories", () => {
		expect(valueDirection("unit")).toBe(1);
		expect(valueDirection("volume")).toBe(1);
		expect(valueDirection("calorie")).toBe(-1);
	});
});
