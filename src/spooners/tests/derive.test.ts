import { describe, expect, test } from "bun:test";
import { valueLeaders, venueOpenState } from "../derive";
import type { ItemDefinition, SpoonersCache } from "../types";

process.env.TZ = "America/New_York";

const beerDefinition = (): ItemDefinition => ({
	id: 1,
	name: "Beer",
	description: "5% 500ml",
	calories: 200,
	itemType: null,
	ageRestriction: null,
	category: "Beer",
	menu: "Drinks",
	keywords: [],
	optionGroups: {},
});

const venue = (
	ref: number,
	currency: string,
	price: number,
): SpoonersCache["venues"][string] => ({
	venue: { id: ref, venueRef: ref, name: `Pub ${ref}` },
	detail: { currency: { code: currency } },
	menus: [],
	items: { Beer: { Pint: price } },
});

const cache: SpoonersCache = {
	venueList: [],
	items: { Beer: beerDefinition() },
	venues: { "1": venue(1, "GBP", 5), "2": venue(2, "EUR", 6) },
};

describe("valueLeaders", () => {
	test("keeps a separate leader per currency", () => {
		const leaders = valueLeaders(cache);
		expect(leaders).toHaveLength(2);
		const currencies = leaders.map((row) => row.currency).sort();
		expect(currencies).toEqual(["EUR", "GBP"]);
		expect(leaders.find((row) => row.currency === "GBP")?.venueName).toBe(
			"Pub 1",
		);
		expect(leaders.find((row) => row.currency === "EUR")?.venueName).toBe(
			"Pub 2",
		);
	});

	test("with a conversion it normalises before comparing", () => {
		// Make €6 worth €3 in GBP terms, so the euro pub wins overall.
		const leaders = valueLeaders(cache, {
			metric: (_kind, value, currency) =>
				currency === "EUR" ? value * 0.5 : value,
			money: (value, currency) => (currency === "EUR" ? value * 0.5 : value),
			currency: "GBP",
		});
		expect(leaders).toHaveLength(1);
		expect(leaders[0]?.currency).toBe("GBP");
		expect(leaders[0]?.venueName).toBe("Pub 2");
		expect(leaders[0]?.price).toBeCloseTo(3, 5);
	});
});

describe("venueOpenState", () => {
	const detail = {
		openingTimes: {
			days: {},
			dates: {
				// Local (New York) calendar day: open.
				"2024-06-01": { open: "10:00", close: "23:00" },
				// UTC calendar day: closed - must be ignored.
				"2024-06-02": { open: "00:00", close: "23:59", isClosed: true },
			},
		},
	};

	test("a one-off override is keyed on the local date, not UTC", () => {
		// 22:30 on 2024-06-01 in New York == 02:30 UTC on 2024-06-02.
		const now = new Date("2024-06-02T02:30:00Z");
		const state = venueOpenState(detail, now);
		expect(state.open).toBe(true);
		expect(state.hours).toBe("10:00–23:00");
	});
});
