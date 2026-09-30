import "./happy-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	readPersisted,
	removePersisted,
	writePersisted,
} from "../hooks/usePersistentState";
import {
	addRecent,
	MAX_PINS,
	MAX_RECENTS,
	parsePinned,
	parseRecents,
	togglePinned,
} from "../recent";

/**
 * The persistence layer promises three things the UI depends on: stored lists
 * stay bounded, a corrupt or hostile payload degrades to an empty list instead
 * of throwing, and blocked storage falls back to memory without crashing.
 */

/**
 * A complete, self-contained `Storage` for the duration of each test.
 *
 * `bun test` runs every suite in one process, and other suites install their own
 * `localStorage` stubs on `globalThis` that are not interchangeable with
 * happy-dom's. Installing a real, fully-formed `Storage` here keeps these tests
 * independent of load order and of whichever suite ran before them.
 */
const installStorage = (): Map<string, string> => {
	const backing = new Map<string, string>();
	const storage: Storage = {
		get length() {
			return backing.size;
		},
		key: (index: number) => [...backing.keys()][index] ?? null,
		getItem: (key: string) => backing.get(key) ?? null,
		setItem: (key: string, value: string) => {
			backing.set(key, String(value));
		},
		removeItem: (key: string) => {
			backing.delete(key);
		},
		clear: () => backing.clear(),
	};
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		writable: true,
		value: storage,
	});
	return backing;
};

const KEYS = ["t:recents", "t:pinned"];

let backing: Map<string, string> = new Map();

beforeEach(() => {
	backing = installStorage();
	for (const key of KEYS) removePersisted(key);
});

afterEach(() => {
	for (const key of KEYS) removePersisted(key);
	backing.clear();
});

describe("bounded entries", () => {
	test("addRecent never returns more than the cap", () => {
		let list = addRecent([], "/a/", 1);
		for (let i = 0; i < 50; i += 1) list = addRecent(list, `/app-${i}/`, i);
		expect(list.length).toBeLessThanOrEqual(MAX_RECENTS);
	});

	test("a stored recents payload is trimmed to the cap on read", () => {
		const oversized = JSON.stringify(
			Array.from({ length: 200 }, (_unused, i) => ({
				href: `/app-${i}/`,
				at: i,
			})),
		);
		window.localStorage.setItem("t:recents", oversized);
		expect(
			parseRecents(window.localStorage.getItem("t:recents") ?? ""),
		).toHaveLength(MAX_RECENTS);
	});

	test("togglePinned caps the list rather than growing forever", () => {
		let list: string[] = [];
		for (let i = 0; i < 50; i += 1) list = togglePinned(list, `/app-${i}/`);
		expect(list.length).toBeLessThanOrEqual(MAX_PINS);
	});

	test("an oversized stored pin payload is trimmed on read", () => {
		const oversized = JSON.stringify(
			Array.from({ length: 500 }, (_unused, i) => `/app-${i}/`),
		);
		window.localStorage.setItem("t:pinned", oversized);
		expect(
			parsePinned(window.localStorage.getItem("t:pinned") ?? ""),
		).toHaveLength(MAX_PINS);
	});
});

describe("corrupt payload tolerance", () => {
	test("malformed JSON yields an empty list instead of throwing", () => {
		for (const raw of ["}{ not json", "", "undefined", "{", "[", "null"]) {
			expect(parseRecents(raw)).toEqual([]);
			expect(parsePinned(raw)).toEqual([]);
		}
	});

	test("a non-array JSON payload yields an empty list", () => {
		for (const raw of ['{"a":1}', '"a string"', "42", "true", "null"]) {
			expect(parseRecents(raw)).toEqual([]);
			expect(parsePinned(raw)).toEqual([]);
		}
	});

	test("mixed junk entries are dropped, valid ones survive", () => {
		const raw = JSON.stringify([
			{ href: "/good/", at: 5 },
			{ href: 42, at: 5 },
			{ href: "/no-at/" },
			{ at: 5 },
			null,
			"a string",
			[],
			{ href: "/nan/", at: "soon" },
			{ href: "/inf/", at: Number.POSITIVE_INFINITY },
		]);
		expect(parseRecents(raw)).toEqual([{ href: "/good/", at: 5 }]);
	});

	test("non-path and off-origin hrefs are rejected", () => {
		const raw = JSON.stringify([
			"javascript:alert(1)",
			"//evil.example",
			"relative/path",
			42,
			null,
			"/cv/",
		]);
		expect(parsePinned(raw)).toEqual(["/cv/"]);
	});

	test("duplicate pins are collapsed", () => {
		expect(parsePinned(JSON.stringify(["/cv/", "/cv/", "/birthday/"]))).toEqual(
			["/cv/", "/birthday/"],
		);
	});

	test("a corrupt payload read through the hook returns the fallback", () => {
		window.localStorage.setItem("t:recents", "}{ corrupt");
		expect(readPersisted<string[]>("t:recents", ["fallback"])).toEqual([
			"fallback",
		]);
	});
});

describe("storage-unavailable tolerance", () => {
	/** Replace `localStorage` with one that throws on every operation. */
	const withBlockedStorage = (run: () => void) => {
		const original = Object.getOwnPropertyDescriptor(window, "localStorage");
		const boom = () => {
			throw new DOMException("denied", "SecurityError");
		};
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get: () => ({
				getItem: boom,
				setItem: boom,
				removeItem: boom,
				clear: boom,
				key: boom,
				length: 0,
			}),
		});
		try {
			run();
		} finally {
			if (original) Object.defineProperty(window, "localStorage", original);
		}
	};

	test("reads fall back to the fallback value", () => {
		removePersisted("t:recents");
		withBlockedStorage(() => {
			expect(() => readPersisted("t:recents", ["fallback"])).not.toThrow();
			expect(readPersisted("t:recents", ["fallback"])).toEqual(["fallback"]);
		});
	});

	test("writes stay in memory when setItem throws (full quota)", () => {
		removePersisted("t:pinned");
		withBlockedStorage(() => {
			expect(() =>
				writePersisted<string[]>("t:pinned", ["/cv/"]),
			).not.toThrow();
			// The value is still readable in this session, just not persisted.
			expect(readPersisted("t:pinned", [] as string[])).toEqual(["/cv/"]);
		});
	});

	test("removePersisted tolerates a throwing storage", () => {
		removePersisted("t:pinned");
		withBlockedStorage(() => {
			expect(() => removePersisted("t:pinned")).not.toThrow();
		});
	});
});
