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
		 * The one live timer, or `undefined` when none is pending.
		 *
		 * A `timer` slot that could be *orphaned* was the original bug: `sync`
		 * has two callers — the timer re-arms itself, and `onVisible` calls it
		 * on `visibilitychange` and `focus` — so focusing before midnight
		 * overwrote the slot and left the previous handle pending forever. At
		 * midnight both survivors fired, each arming a successor, and teardown
		 * could then only ever clear the one handle still in the slot. A chain
		 * survived unmount, retained its whole closure, and kept calling
		 * `setDay`. React stopped warning about setState-after-unmount in 18,
		 * so it failed silently.
		 *
		 * The fix is not "more slots", it is that the arm below happens once,
		 * in the effect body, and `sync` cancels the pending handle before it
		 * arms a successor. So the focus path cannot orphan anything either —
		 * it goes through the same cancel-then-arm — and teardown clears
		 * whatever the last `sync` left behind.
		 */
		let timer: ReturnType<typeof setTimeout> | undefined;

		const sync = () => {
			if (timer !== undefined) clearTimeout(timer);
			const now = dayjs().startOf("day");
			setDay((previous) => (previous.isSame(now, "day") ? previous : now));
			// Re-arm for the following midnight. The 250ms margin avoids firing
			// fractionally early, which would miss the rollover entirely.
			timer = setTimeout(sync, now.add(1, "day").diff(dayjs()) + 250);
		};

		const onVisible = () => {
			if (document.visibilityState === "visible") sync();
		};

		// Armed here, in the effect body, rather than from inside `sync`: that
		// is what makes "this handle is the one teardown releases" a single
		// readable fact instead of something spread across a helper.
		const now = dayjs().startOf("day");
		setDay((previous) => (previous.isSame(now, "day") ? previous : now));
		timer = setTimeout(sync, now.add(1, "day").diff(dayjs()) + 250);
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onVisible);

		return () => {
			if (timer !== undefined) clearTimeout(timer);
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
