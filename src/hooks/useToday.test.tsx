import "../shared/tests/happy-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { useCalendarDay } from "./useToday";

/**
 * `useCalendarDay` keeps "now" honest across a midnight rollover, using two
 * triggers: a timer aimed at the exact next midnight, and `visibilitychange` /
 * `focus` for when the tab was suspended.
 *
 * The defect pinned here is that the two triggers shared one `timer` slot.
 * `sync()` is reachable from both — the timer re-arms itself, and `onVisible`
 * calls it too — so a focus before midnight overwrote the slot and orphaned the
 * pending handle. At midnight both survivors fired, each arming a successor, and
 * the effect's cleanup could then only ever clear the one handle still in the
 * slot. One chain kept running forever, retained its whole closure, and kept
 * calling `setDay` after unmount. React stopped warning about that in 18, so it
 * failed silently.
 *
 * The stub below counts live timers rather than driving the clock, because the
 * thing worth asserting is the *invariant* — at most one outstanding timer,
 * and none at all after unmount — and that is observable without waiting on
 * real time.
 */

let nextId = 1;
/** Outstanding timers, keyed by id. A leaked timer stays in here forever. */
const live = new Map<number, { fn: () => void; ms: number }>();
let armed = 0;
let cleared = 0;

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

beforeEach(() => {
	nextId = 1;
	live.clear();
	armed = 0;
	cleared = 0;
	// biome-ignore lint/suspicious/noExplicitAny: a global stub must match the
	// platform signature, which is overloaded and not expressible in TS.
	(globalThis as any).setTimeout = (fn: () => void, ms: number) => {
		const id = nextId++;
		live.set(id, { fn, ms });
		armed++;
		return id as unknown as ReturnType<typeof setTimeout>;
	};
	// biome-ignore lint/suspicious/noExplicitAny: as above.
	(globalThis as any).clearTimeout = (id: number) => {
		if (live.delete(id)) cleared++;
	};
});

afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: as above.
	(globalThis as any).setTimeout = realSetTimeout;
	// biome-ignore lint/suspicious/noExplicitAny: as above.
	(globalThis as any).clearTimeout = realClearTimeout;
	cleanup();
});

/** Renders the hook and returns its live view. */
const Probe = () => {
	useCalendarDay();
	return <span data-testid="probe" />;
};

/** Fires every callback the hook registered, as a focus event would. */
const fireFocus = () => {
	for (const handler of windowListeners) handler();
};

let windowListeners: (() => void)[] = [];
const realAdd = window.addEventListener.bind(window);

beforeEach(() => {
	windowListeners = [];
	// biome-ignore lint/suspicious/noExplicitAny: a global stub must match the
	// platform signature, which is overloaded and not expressible in TS.
	(window as any).addEventListener = (type: string, fn: () => void) => {
		if (type === "focus" || type === "visibilitychange") {
			windowListeners.push(fn);
		}
		return realAdd(type, fn as EventListener);
	};
});

afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: as above.
	(window as any).addEventListener = realAdd;
});

describe("useCalendarDay", () => {
	test("keeps at most one timer outstanding, however often focus fires", () => {
		render(<Probe />);
		// One timer from the initial sync.
		expect(live.size).toBe(1);

		// Each focus re-syncs. The day has not changed, so no re-render happens
		// — but the old timer must still be cleared, or it accumulates.
		for (let i = 0; i < 5; i++) {
			act(() => {
				fireFocus();
			});
			expect(live.size).toBe(1);
		}
		// Proof the slot was reused rather than leaked: five focus events plus the
		// mount is six armings, and all but the first were cleared.
		expect(armed).toBe(6);
		expect(cleared).toBe(5);
	});

	test("leaves no timer running after unmount", () => {
		const view = render(<Probe />);
		act(() => {
			fireFocus();
		});
		expect(live.size).toBe(1);

		view.unmount();
		// This is the assertion the old code failed: unmounting cleared only the
		// handle in the slot, so the orphaned one survived and kept the chain.
		expect(live.size).toBe(0);
	});
});
