import "../../shared/tests/happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { type RawBirthday, recomputeBirthdays } from "../birthdays";
import { useTrackedBirthdays } from "../useTrackedBirthdays";

const STORAGE_KEY = "custom_birthdays_data";

const BOY = "♂️";
const GIRL = "♀️";
const WEDDING = "💒";

const ada: RawBirthday = { name: "Ada", date: "1990-01-01", kind: BOY };
const grace: RawBirthday = { name: "Grace", date: "1991-02-02", kind: GIRL };
const vows: RawBirthday = { name: "Vows", date: "1992-03-03", kind: WEDDING };

const seed = (...records: RawBirthday[]) => {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
	act(() => {
		act(() => {
			recomputeBirthdays();
		});
	});
};

afterEach(() => {
	cleanup();
	localStorage.clear();
	recomputeBirthdays();
});

describe("useTrackedBirthdays", () => {
	test("PROVE IT FAILS WITHOUT THE SUBSCRIPTION", () => {
		seed(ada);
		const { result } = renderHook(() => useTrackedBirthdays());
		expect(result.current.map((b) => b.name)).toEqual(["Ada"]);

		seed(ada, grace);

		expect(result.current.map((b) => b.name).sort()).toEqual(["Ada", "Grace"]);
	});

	test("a recompute with no change in membership keeps the same names", () => {
		seed(ada, grace);
		const { result } = renderHook(() => useTrackedBirthdays());
		const before = result.current.map((b) => b.name).sort();

		act(() => {
			recomputeBirthdays();
		});

		expect(result.current.map((b) => b.name).sort()).toEqual(before);
	});

	test("unsubscribes, so a later recompute leaves an unmounted hook alone", () => {
		seed(ada);
		const { result, unmount } = renderHook(() => useTrackedBirthdays());
		unmount();

		seed(ada, grace);

		expect(result.current).toHaveLength(1);
	});

	test("the dataset-wide counts the hero derives move with the data", () => {
		seed(ada);
		const { result } = renderHook(() => {
			const tracked = useTrackedBirthdays();
			return {
				people: tracked.length,
				weddings: tracked.filter((b) => b.kind === WEDDING).length,
			};
		});

		expect(result.current.people).toBe(1);
		expect(result.current.weddings).toBe(0);

		seed(ada, grace, vows);

		expect(result.current.people).toBe(3);
		expect(result.current.weddings).toBe(1);
	});

	test("the soonest-upcoming slice the header strip shows grows with the data", () => {
		seed(ada);

		const { result } = renderHook(() => {
			const tracked = useTrackedBirthdays();
			return tracked
				.filter((b) => b.daysBeforeBirthday >= 0)
				.slice(0, 3)
				.map((b) => b.name);
		});

		expect(result.current).toHaveLength(1);

		seed(ada, grace, vows);

		expect(result.current).toHaveLength(3);
		expect([...result.current].sort()).toEqual(["Ada", "Grace", "Vows"]);
	});
});
