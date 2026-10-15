import "../../shared/tests/happy-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { companionLabels } from "../lib/companions";
import { readDeepLink } from "../lib/deep-link";
import { editorViewInfo } from "../lib/inventory";

const REAL_VIEWS = [
	"inventory",
	...Object.keys(editorViewInfo),
	...Object.keys(companionLabels),
];

const ORIGINAL_HREF = window.location.href;

const visit = (search: string) => {
	window.location.href = `https://chneau.github.io/crimson-desert-save-editor/${search}`;
};

beforeEach(() => visit(""));

afterEach(() => {
	window.location.href = ORIGINAL_HREF;
});

describe("view allow-list", () => {
	test("every real view id round-trips, and each one is distinct from the fallback", () => {
		for (const view of REAL_VIEWS) {
			visit(`?view=${view}`);
			const result: { view: string } = readDeepLink();
			if (view === "inventory") {
				expect(result.view).toBe("inventory");
				continue;
			}
			expect(result.view).toBe(view);
			expect(result.view).not.toBe("inventory");
		}
		expect(REAL_VIEWS.length).toBe(11);
	});

	test("an unknown view falls back to the inventory", () => {
		for (const view of [
			"nope",
			"INVENTORY",
			"Inventory",
			"skills ",
			"constructor",
		]) {
			visit(`?view=${encodeURIComponent(view)}`);
			expect(readDeepLink().view).toBe("inventory");
		}
	});

	test("the check is exact membership, not a prefix or substring match", () => {
		const nearMisses = ["inventoryXYZ", "inven", "cond", "skills2", "sKills"];
		for (const view of nearMisses) {
			visit(`?view=${view}`);
			const result = readDeepLink();
			expect(result.view).toBe("inventory");
		}
		visit("?view=conditionXX");
		expect(readDeepLink().view).toBe("inventory");
	});

	test("an absent view falls back to the inventory", () => {
		expect(readDeepLink().view).toBe("inventory");
	});

	test("an empty view falls back to the inventory rather than being truthy-accepted", () => {
		visit("?view=");
		expect(readDeepLink().view).toBe("inventory");
	});

	test("a repeated view takes the first occurrence, which is the attacker's choice too", () => {
		visit("?view=skills&view=camp");
		expect(readDeepLink().view).toBe("skills");
		visit("?view=camp&view=skills");
		expect(readDeepLink().view).toBe("camp");
	});

	test("view and storage are read independently of each other", () => {
		visit("?view=camp&storage=3");
		expect(readDeepLink()).toEqual({ view: "camp", storage: 3 });
		visit("?storage=3&view=camp");
		expect(readDeepLink()).toEqual({ view: "camp", storage: 3 });
		visit("?view=bogus&storage=3");
		expect(readDeepLink()).toEqual({ view: "inventory", storage: 3 });
		visit("?view=camp&storage=-1");
		expect(readDeepLink()).toEqual({ view: "camp", storage: null });
	});
});

describe("storage slot", () => {
	test("a positive safe integer is accepted", () => {
		visit("?storage=1");
		expect(readDeepLink().storage).toBe(1);
		visit("?storage=12");
		expect(readDeepLink().storage).toBe(12);
	});

	test("zero, negatives and floats are rejected", () => {
		for (const raw of ["0", "-1", "-12", "1.5", "0.1", "-0"]) {
			visit(`?storage=${raw}`);
			expect(readDeepLink().storage).toBeNull();
		}
	});

	test("text that is not a number at all is rejected", () => {
		for (const raw of [
			"abc",
			"NaN",
			"Infinity",
			"-Infinity",
			"null",
			"12abc",
			"%20",
		]) {
			visit(`?storage=${encodeURIComponent(raw)}`);
			expect(readDeepLink().storage).toBeNull();
		}
	});

	test("an unsafe integer above the safe range is rejected", () => {
		visit("?storage=9007199254740993");
		expect(readDeepLink().storage).toBeNull();
	});

	test("an absent storage parameter is null, and a zero-valued one is also null", () => {
		visit("");
		expect(readDeepLink().storage).toBeNull();
		visit("?storage=");
		expect(readDeepLink().storage).toBeNull();
	});

	test("repeated storage takes the first occurrence", () => {
		visit("?storage=2&storage=9");
		expect(readDeepLink().storage).toBe(2);
	});
});

describe("the coercion Number() performs before the guard", () => {
	test("`1e3` is accepted as 1000 — scientific notation survives the guard", () => {
		visit("?storage=1e3");
		expect(readDeepLink().storage).toBe(1000);
	});

	test("surrounding whitespace is accepted as 2 — Number() trims", () => {
		visit(`?storage=${encodeURIComponent(" 2 ")}`);
		expect(readDeepLink().storage).toBe(2);
	});

	test("`0x10` is accepted as 16 — hexadecimal survives the guard", () => {
		visit("?storage=0x10");
		expect(readDeepLink().storage).toBe(16);
	});
});

describe("server-side render", () => {
	test("with no window the defaults are returned", () => {
		const had = Reflect.get(globalThis, "window");
		Reflect.set(globalThis, "window", undefined);
		try {
			expect(readDeepLink()).toEqual({ view: "inventory", storage: null });
		} finally {
			Reflect.set(globalThis, "window", had);
		}
		visit("?view=quests&storage=4");
		expect(readDeepLink()).toEqual({ view: "quests", storage: 4 });
	});
});
