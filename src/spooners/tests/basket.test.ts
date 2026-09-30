import { describe, expect, test } from "bun:test";
import { type BasketItem, parseBasket, serializeBasket } from "../basket";

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
