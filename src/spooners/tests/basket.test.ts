import { describe, expect, test } from "bun:test";
import {
	type BasketItem,
	basketVenues,
	parseBasket,
	serializeBasket,
} from "../basket";
import data from "../data/data.json";
import type { SpoonersCache } from "../types";

const cache = data as unknown as SpoonersCache;

describe("basket round-trips through the URL", () => {
	test("names with commas and ampersands survive", () => {
		const items: BasketItem[] = [
			{ name: "Sausages, chips and beans", qty: 2 },
			{ name: "BBQ chicken, maple-cured bacon & Cheddar cheese", qty: 1 },
		];
		const encoded = serializeBasket(items);
		expect(encoded).not.toContain(" ");
		expect(parseBasket(encoded)).toEqual(items);
	});

	test("a comma in a name is not mistaken for a line separator", () => {
		const parsed = parseBasket(
			serializeBasket([{ name: "Sausages, chips and beans", qty: 1 }]),
		);
		expect(parsed).toEqual([{ name: "Sausages, chips and beans", qty: 1 }]);
	});

	test("a colon in a name still parses correctly", () => {
		const items: BasketItem[] = [{ name: "Thornbridge - AM:PM", qty: 3 }];
		expect(parseBasket(serializeBasket(items))).toEqual(items);
	});

	test("legacy unescaped links still parse", () => {
		expect(parseBasket("Guinness:2,Budweiser:1")).toEqual([
			{ name: "Guinness", qty: 2 },
			{ name: "Budweiser", qty: 1 },
		]);
	});

	test("malformed escapes fall back to the raw name", () => {
		expect(parseBasket("100%25:1")).toEqual([{ name: "100%", qty: 1 }]);
		expect(parseBasket("bad%2:1")).toEqual([{ name: "bad%2", qty: 1 }]);
	});
});

describe("basket round-trips against the real dataset", () => {
	// A name that genuinely contains a comma, so the URL path is exercised
	// end to end: serialise -> parse -> resolve venues.
	const COMMA_NAME = "BBQ chicken, maple-cured bacon and Cheddar cheese";

	test("every comma-containing item name resolves to the same venues", () => {
		const commaNames = Object.keys(data.items).filter((name) =>
			name.includes(","),
		);
		// The bug this guards: a comma in a name split the round into pieces.
		expect(commaNames.length).toBeGreaterThan(0);
		for (const name of commaNames) {
			const direct = basketVenues(cache, [{ name, qty: 1 }]);
			const parsed = parseBasket(serializeBasket([{ name, qty: 1 }]));
			expect(parsed).toEqual([{ name, qty: 1 }]);
			const roundTripped = basketVenues(cache, parsed);
			expect(roundTripped.map((venue) => venue.ref)).toEqual(
				direct.map((venue) => venue.ref),
			);
			expect(roundTripped[0]?.lines[0]?.name).toBe(name);
		}
	});

	test("a comma name keeps its sellers through a share link", () => {
		const direct = basketVenues(cache, [{ name: COMMA_NAME, qty: 1 }]);
		expect(direct.length).toBeGreaterThan(0);
		const parsed = parseBasket(serializeBasket([{ name: COMMA_NAME, qty: 1 }]));
		expect(parsed[0]?.name).toBe(COMMA_NAME);
		expect(basketVenues(cache, parsed)).toHaveLength(direct.length);
	});

	test("a multi-item round with commas keeps every line", () => {
		const items: BasketItem[] = [
			{ name: "Sausages, chips and beans", qty: 2 },
			{ name: COMMA_NAME, qty: 1 },
			{ name: "Guinness", qty: 4 },
		];
		expect(parseBasket(serializeBasket(items))).toEqual(items);
	});
});
