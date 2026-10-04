import { useEffect, useState } from "react";
import { type Birthday, birthdays, subscribeBirthdays } from "./birthdays";

/**
 * The whole dataset, kept live.
 *
 * `birthdays` is a module-level `let` that `recomputeBirthdays` reassigns, so a
 * component that reads it during render holds a value that goes stale the
 * moment anything is added, edited or deleted, or the date rolls over. Reading
 * the imported binding is therefore not enough on its own: nothing re-renders
 * the reader, so the stale value is simply what stays on screen.
 *
 * Subscribing fixes the render, not the value — the bump exists purely to make
 * the component run again, and the returned array is the live binding, so the
 * caller reads whatever `recomputeBirthdays` last assigned.
 *
 * This is the same signal `CalendarActions` and the store already use, in a
 * hook rather than a fourth copy of subscribe-and-`setState`.
 *
 * Deriving from this during render is the intended shape: the alternative — a
 * `useMemo` over the imported binding with an empty dependency array — reads
 * correctly in review and silently freezes in production, which is what the
 * hero's four dataset-wide scans did.
 */
export const useTrackedBirthdays = (): Birthday[] => {
	const [, bump] = useState(0);

	useEffect(() => {
		// `subscribeBirthdays` returns `() => boolean`, and React 19's
		// `Destructor` type rejects a return value other than `void` — so the
		// unsubscribe is wrapped rather than returned directly. Same shape as
		// `CalendarActions`.
		const unsubscribe = subscribeBirthdays(() => bump((value) => value + 1));
		return () => {
			unsubscribe();
		};
	}, []);

	return birthdays;
};
