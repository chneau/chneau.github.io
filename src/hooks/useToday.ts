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
		let timer: ReturnType<typeof setTimeout> | undefined;

		/**
		 * Cancel any outstanding timer before arming a new one.
		 *
		 * `sync` has two callers — the timer re-arms itself, and `onVisible`
		 * calls it on `visibilitychange` and `focus` — but they shared one
		 * `timer` slot. Focusing before midnight therefore overwrote the slot and
		 * orphaned the pending handle, so at midnight two chains fired, each
		 * arming a successor, and cleanup could only ever clear the one handle
		 * still in the slot. The survivor retained its whole closure and kept
		 * calling `setDay` after unmount, silently, because React stopped warning
		 * about that in 18.
		 *
		 * Clearing first restores the invariant the cleanup already assumed: at
		 * most one timer outstanding, so clearing the slot clears everything.
		 */
		const clearArmed = () => {
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
		};

		const sync = () => {
			clearArmed();
			const now = dayjs().startOf("day");
			setDay((previous) => (previous.isSame(now, "day") ? previous : now));
			// Re-arm for the following midnight. The 250ms margin avoids firing
			// fractionally early, which would miss the rollover entirely.
			timer = setTimeout(sync, now.add(1, "day").diff(dayjs()) + 250);
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
