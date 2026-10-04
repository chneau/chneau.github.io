import dayjs from "dayjs";
import { useEffect, useState } from "react";

/**
 * Hooks for reading "now" without going stale.
 *
 * The birthday app derives ages and countdowns from the current day. If that is
 * read once at module load, a tab left open across midnight keeps showing
 * yesterday's numbers until it is reloaded - which is exactly what the app used
 * to do.
 */

/**
 * The current calendar day. Re-renders when the day rolls over.
 *
 * Two triggers, because neither is sufficient alone: a timer scheduled for the
 * exact next midnight (precise, but suspended in a background tab), and
 * `visibilitychange` / `focus` (fires reliably on return, but not while the tab
 * stays open in the background).
 */
export const useCalendarDay = (): dayjs.Dayjs => {
	const [day, setDay] = useState(() => dayjs().startOf("day"));

	useEffect(() => {
		/**
		 * Every live timer, cleared wholesale on teardown.
		 *
		 * A single `timer` slot was wrong here: `sync` has two callers — the
		 * timer re-arms itself, and `onVisible` calls it on `visibilitychange`
		 * and `focus` — so focusing before midnight overwrote the slot and
		 * orphaned the pending handle. At midnight both survivors fired, each
		 * arming a successor, and cleanup could then only ever clear the one
		 * handle still in the slot. A chain survived unmount, retained its whole
		 * closure, and kept calling `setDay` forever. React stopped warning about
		 * setState-after-unmount in 18, so it failed silently.
		 *
		 * A `Set` makes the invariant structural rather than something the code
		 * has to keep remembering: no matter how many timers are in flight,
		 * teardown cancels every one of them. `clearArmed()` before each arming
		 * keeps it at one in the steady state, which is what stops a busy tab
		 * accumulating a chain per focus.
		 */
		const timers = new Set<ReturnType<typeof setTimeout>>();

		const arm = (fn: () => void, ms: number) => {
			const handle = setTimeout(() => {
				timers.delete(handle);
				fn();
			}, ms);
			timers.add(handle);
		};

		const clearArmed = () => {
			for (const handle of timers) clearTimeout(handle);
			timers.clear();
		};

		const sync = () => {
			clearArmed();
			const now = dayjs().startOf("day");
			setDay((previous) => (previous.isSame(now, "day") ? previous : now));
			// Re-arm for the following midnight. The 250ms margin avoids firing
			// fractionally early, which would miss the rollover entirely.
			arm(sync, now.add(1, "day").diff(dayjs()) + 250);
		};

		const onVisible = () => {
			if (document.visibilityState === "visible") sync();
		};

		sync();
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onVisible);

		return () => {
			clearArmed();
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", onVisible);
		};
	}, []);

	return day;
};

/*
 * A `useNow` hook was also removed from here. It was speculative: nothing
 * imported it, and `Countdown.tsx` grew its own ticker instead, which
 * reschedules against the actual next tick rather than drifting on a fixed
 * interval. Reintroducing a generic version here would only invite the
 * drifting one back.
 */
