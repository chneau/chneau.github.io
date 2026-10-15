import "../../shared/tests/happy-dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import type { Birthday } from "../birthdays";

mock.module("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: "en" },
	}),
}));

let timeouts: { id: number; fn: () => void; ms: number; done: boolean }[] = [];
let nextId = 1;
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

const pending = () => timeouts.filter((t) => !t.done);

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

let frozenBase = 0;
let clockOffset = 0;
const realNow = Date.now;

const now = () => frozenBase + clockOffset;

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

const advanceAndTick = (ms: number) => {
	act(() => {
		advance(ms);
	});
	runOldest();
};

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
	const props = { birthdays: people as unknown as Birthday[] };
	return render(<Countdown {...props} />);
};

describe("Countdown / the ticking", () => {
	test("it schedules a sub-second-aligned timeout, not a drifting interval", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);

		const [first] = pending();
		expect(first).toBeDefined();
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

		advance(45_000);
		setHidden(true);
		expect(digits(view.container)).toEqual(before);

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
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		advance(45_000);
		setHidden(false);

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

		expect(
			view.container.querySelector(".tk-count")?.getAttribute("aria-live"),
		).toBeNull();
		view.unmount();
	});

	test("the announcement is coarse: hours or days, never seconds", async () => {
		const view = await renderHero([
			recordDueIn("Ada", 3 * 86_400_000 + 3_600_000),
		]);
		const status = view.container.querySelector('[role="status"]');

		expect(status?.textContent).toBe("3 app.countdown.days");

		const before = status?.textContent;
		advanceAndTick(1000);
		advanceAndTick(1000);
		expect(status?.textContent).toBe(before);
		view.unmount();
	});

	test("the announcement reports hours, not days, once under a day", async () => {
		const view = await renderHero([
			recordDueIn("Ada", 23 * 3_600_000 + 59 * 60_000),
		]);
		expect(view.container.querySelector('[role="status"]')?.textContent).toBe(
			"23 app.countdown.hours",
		);
		view.unmount();
	});

	test("inside the final hour the announcement goes quiet rather than repeating", async () => {
		const view = await renderHero([recordDueIn("Ada", 30 * 60_000)]);
		const status = view.container.querySelector('[role="status"]');

		expect(status?.textContent).toBe("");
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
		expect(digits(view.container)).toEqual(["00"]);
		view.unmount();
	});
});

describe("Countdown / layout of the units", () => {
	test("a leading zero day column is dropped, the rest are kept", async () => {
		const view = await renderHero([
			recordDueIn("Ada", 3 * 3_600_000 + 5 * 60_000),
		]);

		expect(digits(view.container)).toEqual(["03", "05", "00"]);
		view.unmount();
	});

	test("a countdown of days keeps the day column", async () => {
		const view = await renderHero([recordDueIn("Ada", 3 * 86_400_000)]);
		expect(digits(view.container)).toEqual(["03", "00", "00", "00"]);
		view.unmount();
	});
});
