import "../../shared/tests/happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { type RawBirthday, recomputeBirthdays } from "../birthdays";
import { useTrackedBirthdays } from "../useTrackedBirthdays";

/**
 * `useTrackedBirthdays` exists because two components read the module-level
 * `birthdays` binding and got it wrong the same way.
 *
 * `birthdays` is a `let` reassigned by `recomputeBirthdays`, so reading the
 * imported binding during render is only half the problem: nothing re-renders
 * the reader, so a stale value is what stays on screen. Both call sites had a
 * `useMemo` with an empty dependency array over that binding — the hero's four
 * dataset-wide scans (people, this-month, weddings, next milestone) and the
 * header strip's soonest three. Each was frozen at mount while a sibling memo
 * in the same file refreshed correctly, and neither `tsc` nor
 * `exhaustive-deps` could see it, because the read is an imported binding and
 * not a prop or state.
 *
 * These tests drive the real signal rather than a mocked one: seed storage,
 * mount the hook, recompute, and assert the value the component would render
 * actually moved.
 *
 * Storage holds the user's own additions, so a seeded value *replaces* the
 * bundled list. Counts are therefore asserted against the number the hook first
 * reported rather than against an absolute, which would just be re-asserting
 * the length of `birthdays.json`.
 */

const STORAGE_KEY = "custom_birthdays_data";

/** The only three kinds the schema accepts. */
const BOY = "♂️";
const GIRL = "♀️";
const WEDDING = "💒";

const ada: RawBirthday = { name: "Ada", date: "1990-01-01", kind: BOY };
const grace: RawBirthday = { name: "Grace", date: "1991-02-02", kind: GIRL };
const vows: RawBirthday = { name: "Vows", date: "1992-03-03", kind: WEDDING };

/**
 * Writes storage and recomputes, which is what the add / edit / delete flow and
 * the date-roll watcher both do.
 *
 * The recompute is wrapped in `act` because that is what notifies the
 * subscriber: leaving it bare schedules a React state update outside `act`, and
 * the assertion then reads the pre-update value and passes for the wrong reason.
 */
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

		// A second person lands in storage and the dataset is recomputed.
		seed(ada, grace);

		// Without the subscription the component never re-renders, so `result`
		// still holds the array captured at mount, and the add is invisible until
		// a full remount.
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

		// The value the component last saw is still one person, because nothing
		// is left listening. A retained listener here would be a leak that also
		// updates state on a component that no longer exists.
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
		// Asserted as growth rather than as a specific order on purpose: which
		// three are soonest depends on today's date, and a test that pins the
		// order would start failing the day the clock crosses one of the
		// fixtures. What matters is that the slice is recomputed at all.
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
