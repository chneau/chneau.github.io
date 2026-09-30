import "../../shared/tests/happy-dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import type { Birthday } from "../birthdays";

/**
 * Tests for the clock in `Countdown.tsx`.
 *
 * The interesting failure mode is not "the number is wrong", it is "the number
 * is wrong and stays wrong": a backgrounded tab has its timers throttled to
 * roughly one a minute, so a countdown built on a bare `setInterval` freezes
 * and resumes up to a minute stale. The ticker therefore resyncs on
 * `visibilitychange`, and that is what these tests pin down.
 *
 * `setTimeout` is stubbed so the schedule can be inspected and driven without
 * waiting on real time, and `react-i18next` is stubbed to return the key, so an
 * assertion on a digit cannot be confused with a translation.
 */

mock.module("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: "en" },
	}),
}));

// --- the timer stub ------------------------------------------------------

/** Every timeout this stub has ever handed out, and whether it has settled. */
let timeouts: { id: number; fn: () => void; ms: number; done: boolean }[] = [];
let nextId = 1;
/** Every id passed to `clearTimeout`, in order. */
let cleared: number[] = [];

const globals = globalThis as unknown as Record<string, unknown>;
const realSetTimeout = globals.setTimeout;
const realClearTimeout = globals.clearTimeout;

const installTimers = () => {
	timeouts = [];
	cleared = [];
	nextId = 1;
	globals.setTimeout = (fn: () => void, ms: number) => {
		const id = nextId++;
		timeouts.push({ id, fn, ms: Number(ms), done: false });
		return id;
	};
	globals.clearTimeout = (id: number) => {
		cleared.push(Number(id));
		const found = timeouts.find((t) => t.id === Number(id));
		if (found) found.done = true;
	};
};

/**
 * Timeouts still outstanding. A real timer is settled the moment its callback
 * returns, so the stub marks one done here too — otherwise every tick would
 * appear to leave a second timer behind and "no pile-up" would be untestable.
 */
const pending = () => timeouts.filter((t) => !t.done);

/** Fire the oldest outstanding timeout, as the event loop would. */
const runOldest = () => {
	const next = pending()[0];
	if (!next) throw new Error("no pending timeout");
	act(() => {
		next.done = true;
		next.fn();
	});
};

const restoreTimers = () => {
	globals.setTimeout = realSetTimeout;
	globals.clearTimeout = realClearTimeout;
};

/**
 * The wall clock, frozen.
 *
 * `Date.now` is the only clock `Countdown` reads, and `setTimeout` is stubbed
 * above, so nothing else has to agree with it. Freezing it outright — rather
 * than offsetting a still-ticking one — is what makes the digit assertions
 * exact: a deadline built as "3 days from now" stays exactly 3 days from now
 * however long the surrounding test file takes to get there, so a slow frame
 * cannot turn "03" into "02" and fail a test that has nothing to do with speed.
 */
let frozenBase = 0;
let clockOffset = 0;
const realNow = Date.now;

/** The instant the component sees. */
const now = () => frozenBase + clockOffset;

/** Move the frozen clock forward; offsets accumulate within a test. */
const advance = (ms: number) => {
	clockOffset += ms;
};

beforeEach(() => {
	installTimers();
	frozenBase = realNow.call(Date);
	clockOffset = 0;
	Date.now = now;
	Object.defineProperty(document, "hidden", {
		configurable: true,
		writable: true,
		value: false,
	});
});

afterEach(() => {
	cleanup();
	restoreTimers();
	Date.now = realNow;
});

/** Set the tab's visibility and fire the event the component listens for. */
const setHidden = (hidden: boolean) => {
	act(() => {
		Object.defineProperty(document, "hidden", {
			configurable: true,
			writable: true,
			value: hidden,
		});
		document.dispatchEvent(new Event("visibilitychange"));
	});
};

/** Advance the clock and let the already-scheduled tick run. */
const advanceAndTick = (ms: number) => {
	act(() => {
		advance(ms);
	});
	runOldest();
};

// --- fixtures ------------------------------------------------------------

/** The narrow slice of `Birthday` the hero reads. */
const record = (name: string, inDays: number, kind: "♂️" | "♀️" | "💒" = "♀️") => {
	const next = new Date(Date.now() + inDays * 24 * 60 * 60 * 1000);
	return {
		name,
		kind,
		age: 30,
		birthday: new Date("1996-01-01"),
		birthdayString: "1996-01-01",
		nextBirthday: next,
		daysBeforeBirthday: inDays,
		progress: 50,
		month: 1,
		monthName: "jan",
		sign: "aries",
		signSymbol: "♈",
		ageGroup: "adults",
		element: "fire",
		season: "winter",
		chineseZodiac: "rat",
		generation: "millennials",
		decade: "1990s",
		milestone: false,
		moonPhase: "full_moon",
	};
};

/**
 * A record whose countdown lands `msFromNow` from the current clock.
 *
 * `daysBeforeBirthday` is deliberately non-zero: the hero treats 0 as
 * "happening today" and re-points the deadline at the end of the day, which
 * would make the deadline untestable. Everything else follows the clock.
 */
const recordDueIn = (name: string, msFromNow: number) => ({
	...record(name, 1),
	nextBirthday: new Date(now() + msFromNow),
});

const digits = (container: HTMLElement) =>
	[...container.querySelectorAll(".tk-count__value")].map(
		(el) => el.textContent ?? "",
	);

type HeroRecord = ReturnType<typeof record>;

const renderHero = async (
	people: HeroRecord[],
): Promise<ReturnType<typeof render>> => {
	const { Countdown } = await import("../Countdown");
	// The fixtures carry only the fields the hero reads; the prop is the full
	// `Birthday`, so the widening happens here, once, rather than at every use.
	const props = { birthdays: people as unknown as Birthday[] };
	return render(<Countdown {...props} />);
};

// --- tests ---------------------------------------------------------------

describe("Countdown / the ticking", () => {
	test("it schedules a sub-second-aligned timeout, not a drifting interval", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);

		const [first] = pending();
		expect(first).toBeDefined();
		// never a full second, and never zero: aligned to the next boundary
		expect(first?.ms).toBeGreaterThan(0);
		expect(first?.ms).toBeLessThanOrEqual(1000);
		view.unmount();
	});

	test("each tick reschedules exactly one timeout, so there is no pile-up", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		expect(pending().length).toBe(1);

		runOldest();
		expect(pending().length).toBe(1);

		runOldest();
		expect(pending().length).toBe(1);
		view.unmount();
	});

	test("unmounting clears the pending timeout", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		const scheduled = pending()[0];
		if (!scheduled) throw new Error("nothing was scheduled");

		view.unmount();

		expect(cleared).toContain(scheduled.id);
		// React strict mode mounts, unmounts, remounts: still nothing outstanding
		expect(pending().length).toBe(0);
	});

	test("the seconds digit advances as the clock runs", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		const before = digits(view.container);

		advanceAndTick(1000);

		const after = digits(view.container);
		expect(after.at(-1)).not.toBe(before.at(-1));
		view.unmount();
	});
});

describe("Countdown / a backgrounded tab", () => {
	test("returning to the foreground resyncs, instead of waiting for the next tick", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		const before = digits(view.container);

		// The tab is hidden: the browser throttles timers to ~1/min, so the
		// digits are stale here, and the timeout has not been allowed to run.
		advance(45_000);
		setHidden(true);
		expect(digits(view.container)).toEqual(before);

		// Back in the foreground: the value corrects immediately.
		setHidden(false);

		expect(digits(view.container)).not.toEqual(before);
		view.unmount();
	});

	test("a hidden tab does not resync on every spurious event", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		const before = digits(view.container);

		advance(45_000);
		setHidden(true);
		setHidden(true);

		expect(digits(view.container)).toEqual(before);
		view.unmount();
	});

	test("the countdown is right after a long hidden stretch, not a minute behind", async () => {
		// A deadline 3 days out, and the tab was hidden for 45 seconds.
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		advance(45_000);
		setHidden(false);

		// 2 days, 23 hours, 59 minutes, 15 seconds: the 45s hidden stretch is
		// fully accounted for. Without the resync the seconds would still read
		// 00, i.e. a full minute stale.
		expect(digits(view.container)).toEqual(["02", "23", "59", "15"]);
		view.unmount();
	});

	test("the progress meta and the pills do not re-render on every tick", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		const meta = view.container.querySelector(".tk-progress__meta");
		const before = meta?.innerHTML;

		runOldest();
		runOldest();
		runOldest();

		// Only the ticking child re-renders; the parent's own output is stable.
		expect(meta?.innerHTML).toBe(before);
		view.unmount();
	});
});

describe("Countdown / what is announced", () => {
	test("there is exactly one live region, and it is not the digits", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);

		const live = view.container.querySelectorAll(
			'[aria-live], [role="status"], [role="alert"], [role="timer"]',
		);
		expect(live.length).toBe(1);
		expect(live[0]?.getAttribute("role")).toBe("status");

		// the ticking block itself carries no live semantics at all
		expect(
			view.container.querySelector(".tk-count")?.getAttribute("aria-live"),
		).toBeNull();
		view.unmount();
	});

	test("the announcement is coarse: hours or days, never seconds", async () => {
		// Deliberately not on a day boundary: an hour past the mark, so ticking
		// a second cannot cross into a different day count. A deadline of exactly
		// 3 days would drop to "2 days" one second early, which is correct
		// behaviour and not what this test is about.
		const view = await renderHero([
			recordDueIn("Ada", 3 * 86_400_000 + 3_600_000),
		]);
		const status = view.container.querySelector('[role="status"]');

		expect(status?.textContent).toBe("3 app.countdown.days");

		// a per-second burst is what the old aria-live did; the text here does
		// not move as the seconds tick
		const before = status?.textContent;
		advanceAndTick(1000);
		advanceAndTick(1000);
		expect(status?.textContent).toBe(before);
		view.unmount();
	});

	test("the announcement reports hours, not days, once under a day", async () => {
		// 23 hours and 59 minutes out. `Math.floor(diff / HOUR)` is 23 here, so
		// this is where the granularity actually switches from days to hours.
		const view = await renderHero([
			recordDueIn("Ada", 23 * 3_600_000 + 59 * 60_000),
		]);
		expect(view.container.querySelector('[role="status"]')?.textContent).toBe(
			"23 app.countdown.hours",
		);
		view.unmount();
	});

	test("inside the final hour the announcement goes quiet rather than repeating", async () => {
		// 30 minutes out: hours is 0, so there is no coarse unit left to say.
		const view = await renderHero([recordDueIn("Ada", 30 * 60_000)]);
		const status = view.container.querySelector('[role="status"]');

		expect(status?.textContent).toBe("");
		// and the digits are still there and still readable
		expect(digits(view.container).length).toBeGreaterThan(0);
		view.unmount();
	});

	test("a countdown of a few hours announces the hours", async () => {
		const view = await renderHero([recordDueIn("Ada", 5 * 3_600_000)]);

		expect(view.container.querySelector('[role="status"]')?.textContent).toBe(
			"5 app.countdown.hours",
		);
		view.unmount();
	});

	test("an elapsed deadline does not announce anything stale", async () => {
		const view = await renderHero([recordDueIn("Ada", -60_000)]);

		expect(view.container.querySelector('[role="status"]')?.textContent).toBe(
			"",
		);
		// the digits show the same, rather than a negative countdown
		expect(digits(view.container)).toEqual(["00"]);
		view.unmount();
	});
});

describe("Countdown / layout of the units", () => {
	test("a leading zero day column is dropped, the rest are kept", async () => {
		const view = await renderHero([
			recordDueIn("Ada", 3 * 3_600_000 + 5 * 60_000),
		]);

		// hours, minutes, seconds: no "00 Days" column
		expect(digits(view.container)).toEqual(["03", "05", "00"]);
		view.unmount();
	});

	test("a countdown of days keeps the day column", async () => {
		// exactly 3 days out, on a frozen clock
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		expect(digits(view.container)).toEqual(["03", "00", "00", "00"]);
		view.unmount();
	});
});
