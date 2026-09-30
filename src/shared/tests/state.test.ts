import { describe, expect, test } from "bun:test";
import {
	readPersisted,
	removePersisted,
	subscribePersisted,
	writePersisted,
} from "../hooks/usePersistentState";
import {
	type ColorMode,
	type ResolvedColorMode,
	resolveColorMode,
	systemPrefersDark,
} from "../hooks/useThemeMode";
import { addRecent, type RecentApp, togglePinned } from "../recent";

describe("persistent state store", () => {
	test("returns the fallback until a value is written", () => {
		expect(readPersisted("test:missing", 42)).toBe(42);
	});

	test("write then read round-trips the value", () => {
		writePersisted("test:round", { a: 1 });
		expect(readPersisted("test:round", { a: 0 })).toEqual({ a: 1 });
	});

	test("remove resets readers to the fallback", () => {
		writePersisted("test:remove", "value");
		expect(readPersisted("test:remove", "fallback")).toBe("value");
		removePersisted("test:remove");
		expect(readPersisted("test:remove", "fallback")).toBe("fallback");
	});

	test("subscribers are notified on write and can unsubscribe", () => {
		let calls = 0;
		const unsubscribe = subscribePersisted("test:sub", () => {
			calls += 1;
		});
		writePersisted("test:sub", 1);
		expect(calls).toBe(1);
		unsubscribe();
		writePersisted("test:sub", 2);
		expect(calls).toBe(1);
	});

	test("uses custom (de)serializers", () => {
		writePersisted("test:csv", [1, 2, 3], {
			serialize: (value) => value.join(","),
			deserialize: (raw) => raw.split(",").map(Number),
		});
		expect(readPersisted("test:csv", [] as number[])).toEqual([1, 2, 3]);
	});
});

describe("recent apps", () => {
	const seed: RecentApp[] = [
		{ href: "/a/", at: 3 },
		{ href: "/b/", at: 2 },
		{ href: "/c/", at: 1 },
	];

	test("addRecent moves an existing entry to the front", () => {
		const next = addRecent(seed, "/c/", 9);
		expect(next.map((entry) => entry.href)).toEqual(["/c/", "/a/", "/b/"]);
		expect(next[0]?.at).toBe(9);
	});

	test("addRecent caps the list length", () => {
		const next = addRecent(seed, "/d/", 9, 2);
		expect(next.map((entry) => entry.href)).toEqual(["/d/", "/a/"]);
	});

	test("addRecent does not mutate the input", () => {
		const before = JSON.stringify(seed);
		addRecent(seed, "/z/", 9);
		expect(JSON.stringify(seed)).toBe(before);
	});
});

describe("pinned apps", () => {
	test("togglePinned adds to the front", () => {
		expect(togglePinned([], "/a/")).toEqual(["/a/"]);
		expect(togglePinned(["/a/"], "/b/")).toEqual(["/b/", "/a/"]);
	});

	test("togglePinned removes when already present", () => {
		expect(togglePinned(["/a/", "/b/"], "/a/")).toEqual(["/b/"]);
	});
});

describe("theme mode", () => {
	test("resolveColorMode follows the system only for auto", () => {
		const cases: Array<[ColorMode, boolean, ResolvedColorMode]> = [
			["auto", true, "dark"],
			["auto", false, "light"],
			["dark", false, "dark"],
			["light", true, "light"],
		];
		for (const [mode, system, expected] of cases) {
			expect(resolveColorMode(mode, system)).toBe(expected);
		}
	});

	test("systemPrefersDark is false without a browser", () => {
		expect(systemPrefersDark()).toBe(false);
	});
});
