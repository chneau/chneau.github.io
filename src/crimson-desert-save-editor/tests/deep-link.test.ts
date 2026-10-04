// Registered rather than stubbed: `readDeepLink` reads `window.location.search`,
// and a hand-written `window` stub would prove nothing about `URLSearchParams`
// against a real query string. The registrator no-ops when a DOM already exists,
// so this costs nothing when another suite in the shared Bun process got there first.
import "../../shared/tests/happy-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { companionLabels } from "@/lib/companions";
import { readDeepLink } from "@/lib/deep-link";
import { editorViewInfo } from "@/lib/inventory";

/**
 * `?view=` and `?storage=` are the only attacker-controllable inputs the editor
 * has: any link to the app can carry them. The contract pinned here is that a
 * deep link may select a section and a storage slot and nothing else — an
 * unknown, near-miss or hostile value resolves to the defaults rather than
 * reaching the engine.
 */

/** Every id the app actually renders, rebuilt from the app's own tables rather
 * than retyped, so a new view cannot be added without this test following it. */
const REAL_VIEWS = [
	"inventory",
	...Object.keys(editorViewInfo),
	...Object.keys(companionLabels),
];

const ORIGINAL_HREF = window.location.href;

/** Point the document at a query string. A fresh `href` per test rather than a
 * mutated `window` stub: stubbing leaves state behind in a process shared with
 * every other suite, which is how one test file ends up breaking another. */
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
			// Widened to `string` deliberately: the test's job is to catch a value
			// that is *not* one of the ids, which the returned `SaveView` union
			// cannot express without a cast.
			const result: { view: string } = readDeepLink();
			if (view === "inventory") {
				// `inventory` is both a real view and the fallback, so a rejection
				// here would be invisible — the identity assertions below carry it.
				expect(result.view).toBe("inventory");
				continue;
			}
			expect(result.view).toBe(view);
			expect(result.view).not.toBe("inventory");
		}
		// A test that passes on an empty table is not a test; the app has eleven.
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
		// A `startsWith`/`includes` allow-list would accept all five of these and
		// hand a hostile link the editor's own vocabulary with junk glued on.
		const nearMisses = ["inventoryXYZ", "inven", "cond", "skills2", "sKills"];
		for (const view of nearMisses) {
			visit(`?view=${view}`);
			const result = readDeepLink();
			expect(result.view).toBe("inventory");
		}
		// `inventoryXYZ` resolves to `inventory` — the *fallback*, not a match:
		// proved by the prefix of a view whose id the fallback does not share.
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
		// `URLSearchParams.get` is first-wins, not last-wins. Asserted rather than
		// assumed: a last-wins parser would let a link the app rewrites (a share
		// button appending `?view=`) override what the user clicked.
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
		// A bad view does not invalidate a good slot, and vice versa: the editor
		// shows the inventory of the requested slot rather than resetting to the
		// first one because the section name was wrong.
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
		// Slot 0 and a fraction are not addressesable: `Number.isSafeInteger` plus
		// `> 0` is what keeps `-1` from indexing off the end of the slot list.
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
		// 2^53 is representable but no longer every-integer-exact; accepting it
		// would address a slot whose index has already silently rounded.
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
	// The three below are documented because they are surprising, not because
	// they are wanted. They pass the `Number.isSafeInteger && > 0` guard, so the
	// deep link accepts a slot number written in a form nobody would type. Each
	// resolves to an in-range slot, so no out-of-bounds read follows; pinned so
	// that tightening `storage` to a digits-only check is a deliberate decision
	// with a failing test, rather than a silent behaviour change.
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
		// The guard exists because the module is imported by the SSR/prerender
		// path as well as the browser bundle. `Reflect.set` is used instead of a
		// cast so no type assertion is needed, and the restore is in a `finally`
		// because every suite in this Bun process shares this global — leaving
		// `window` deleted would break all of them.
		const had = Reflect.get(globalThis, "window");
		Reflect.set(globalThis, "window", undefined);
		try {
			expect(readDeepLink()).toEqual({ view: "inventory", storage: null });
		} finally {
			Reflect.set(globalThis, "window", had);
		}
		// Proved restored rather than asserted by construction: the browser path
		// must still answer after the SSR branch has run.
		visit("?view=quests&storage=4");
		expect(readDeepLink()).toEqual({ view: "quests", storage: 4 });
	});
});
