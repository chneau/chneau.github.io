import "../shared/tests/happy-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { useCalendarDay } from "./useToday";

let nextId = 1;
const live = new Map<number, { fn: () => void; ms: number }>();
let armed = 0;
let cleared = 0;

const globals = globalThis as unknown as {
	setTimeout: (fn: () => void, ms: number) => unknown;
	clearTimeout: (id: unknown) => void;
};
const realTimers = {
	setTimeout: globalThis.setTimeout,
	clearTimeout: globalThis.clearTimeout,
} as unknown as typeof globals;

const windowStub = window as unknown as {
	addEventListener: (type: string, fn: (event: Event) => void) => void;
};

beforeEach(() => {
	nextId = 1;
	live.clear();
	armed = 0;
	cleared = 0;
	globals.setTimeout = (fn: () => void, ms: number) => {
		const id = nextId++;
		live.set(id, { fn, ms });
		armed++;
		return id;
	};
	globals.clearTimeout = (id: unknown) => {
		if (typeof id === "number" && live.delete(id)) cleared++;
	};
});

afterEach(() => {
	globals.setTimeout = realTimers.setTimeout;
	globals.clearTimeout = realTimers.clearTimeout;
	cleanup();
});

const Probe = () => {
	useCalendarDay();
	return <span data-testid="probe" />;
};

const fireFocus = () => {
	for (const handler of windowListeners) handler();
};

let windowListeners: (() => void)[] = [];
const realAdd = window.addEventListener.bind(window);

beforeEach(() => {
	windowListeners = [];
	windowStub.addEventListener = (type: string, fn: (event: Event) => void) => {
		if (type === "focus" || type === "visibilitychange") {
			windowListeners.push(() => fn(new Event(type)));
		}
		realAdd(type, fn);
	};
});

afterEach(() => {
	windowStub.addEventListener = realAdd;
});

describe("useCalendarDay", () => {
	test("keeps at most one timer outstanding, however often focus fires", () => {
		render(<Probe />);
		expect(live.size).toBe(1);

		for (let i = 0; i < 5; i++) {
			act(() => {
				fireFocus();
			});
			expect(live.size).toBe(1);
		}
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
		expect(live.size).toBe(0);
	});
});
