import "../../shared/tests/happy-dom";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	setSystemTime,
	test,
} from "bun:test";
import type { Options as ConfettiOptions } from "canvas-confetti";
import { confettiPalette } from "../celebration";

type Celebration = typeof import("../celebration");
type ConfettiSubject = NonNullable<
	Parameters<Celebration["triggerConfetti"]>[0]
>["subject"];

const confettiCalls: ConfettiOptions[] = [];

mock.module("canvas-confetti", () => ({
	default: (options: ConfettiOptions) => {
		confettiCalls.push(options);
		return Promise.resolve(undefined);
	},
}));

const timers = new Map<number, { fn: () => void; ms: number }>();
const cleared: number[] = [];
let nextTimerId = 1;

const globals = globalThis as unknown as Record<string, unknown>;
const realTimers = {
	setInterval: globals.setInterval,
	clearInterval: globals.clearInterval,
};

const installTimers = () => {
	timers.clear();
	cleared.length = 0;
	nextTimerId = 1;
	globals.setInterval = (fn: () => void, ms: number) => {
		const id = nextTimerId++;
		timers.set(id, { fn, ms: Number(ms) });
		return id;
	};
	globals.clearInterval = (id: number) => {
		cleared.push(Number(id));
		timers.delete(Number(id));
	};
};

const tick = (id: number) => {
	const timer = timers.get(id);
	if (!timer) throw new Error(`no live interval ${id}`);
	timer.fn();
};

const onlyTimer = (): number => {
	const ids = [...timers.keys()];
	if (ids.length !== 1 || ids[0] === undefined) {
		throw new Error(`expected exactly 1 live interval, got ${ids.length}`);
	}
	return ids[0];
};

const realWindow = globalThis.window;

const realLocalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage",
);

const DAY = 24 * 60 * 60 * 1000;

const dayOf = (ms: number) => {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const matchMediaAnswering = (reduce: boolean) => {
	window.matchMedia = ((query: string) => ({
		matches: reduce && query.includes("prefers-reduced-motion"),
		media: query,
		onchange: null,
		addListener: () => undefined,
		removeListener: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		dispatchEvent: () => false,
	})) as typeof window.matchMedia;
};

const blockedStorage = () => {
	const boom = () => {
		throw new DOMException("site data blocked", "SecurityError");
	};
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		get: boom,
	});
};

const memoryStorage = () => {
	const map = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		writable: true,
		value: {
			get length() {
				return map.size;
			},
			key: (i: number) => [...map.keys()][i] ?? null,
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, v),
			removeItem: (k: string) => void map.delete(k),
			clear: () => map.clear(),
		},
	});
	return map;
};

let instanceCounter = 0;
const load = async (): Promise<Celebration> =>
	(await import(`../celebration?instance=${instanceCounter++}`)) as Celebration;

const restoreGlobals = () => {
	globals.setInterval = realTimers.setInterval;
	globals.clearInterval = realTimers.clearInterval;
	globalThis.window = realWindow;
	if (realLocalStorage) {
		Object.defineProperty(globalThis, "localStorage", realLocalStorage);
	} else {
		Reflect.deleteProperty(globalThis, "localStorage");
	}
};

const START = new Date("2026-09-30T10:00:00").getTime();

beforeEach(() => {
	restoreGlobals();
	confettiCalls.length = 0;
	installTimers();
	setSystemTime(new Date(START));
	matchMediaAnswering(false);
	memoryStorage();
});

afterEach(() => {
	restoreGlobals();
	setSystemTime(new Date());
});

afterAll(restoreGlobals);

describe("celebration / prefers-reduced-motion", () => {
	test("a burst is a no-op when the user has asked for less motion", async () => {
		matchMediaAnswering(true);
		const { triggerConfetti } = await load();

		const stop = triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });

		expect(timers.size).toBe(0);
		confettiCalls.length = 0;
		expect(confettiCalls).toEqual([]);
		expect(() => stop()).not.toThrow();
		expect(confettiCalls).toEqual([]);
	});

	test("it does not consume the day's allowance, so the burst is still owed", async () => {
		matchMediaAnswering(true);
		const first = await load();
		first.triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });

		matchMediaAnswering(false);
		const second = await load();
		second.triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });

		expect(timers.size).toBe(1);
	});

	test("an absent matchMedia means no preference, not a request for less motion", async () => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			writable: true,
			value: undefined,
		});
		const { triggerConfetti } = await load();

		triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });

		expect(timers.size).toBe(1);
	});

	test("a matchMedia that throws is treated as no preference, not a crash", async () => {
		window.matchMedia = (() => {
			throw new TypeError("matchMedia is unavailable here");
		}) as typeof window.matchMedia;
		const { triggerConfetti } = await load();

		expect(() =>
			triggerConfetti({ subject: { name: "Ada", kind: "♀️" } }),
		).not.toThrow();
		expect(timers.size).toBe(1);
	});

	test("every call is also flagged disableForReducedMotion, as a second line of defence", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });

		tick(onlyTimer());
		expect(confettiCalls.length).toBeGreaterThan(0);
		for (const call of confettiCalls) {
			expect(call.disableForReducedMotion).toBe(true);
		}
	});
});

describe("celebration / throttling", () => {
	const subject = (name: string): ConfettiSubject => ({ name, kind: "♂️" });

	test("a second burst for the same person on the same day is refused", async () => {
		const { triggerConfetti } = await load();

		triggerConfetti({ subject: subject("Ada") });
		expect(timers.size).toBe(1);

		const reload = await load();
		reload.triggerConfetti({ subject: subject("Ada") });

		expect(timers.size).toBe(1);
		expect(cleared).toEqual([]);
	});

	test("the throttle is per person, not global", async () => {
		const { triggerConfetti } = await load();

		triggerConfetti({ subject: subject("Ada") });
		const reload = await load();
		reload.triggerConfetti({ subject: subject("Grace") });

		expect(timers.size).toBe(2);
	});

	test("it lifts at midnight", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti({ subject: subject("Ada") });

		setSystemTime(new Date(new Date(START).setHours(23, 59, 30, 0)));
		const evening = await load();
		evening.triggerConfetti({ subject: subject("Ada") });
		expect(timers.size).toBe(1);

		setSystemTime(new Date(START + DAY + 60_000));
		const nextDay = await load();
		nextDay.triggerConfetti({ subject: subject("Ada") });
		expect(timers.size).toBe(2);
	});

	test("it is keyed on the local calendar day, not on elapsed hours", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti({ subject: subject("Ada") });

		setSystemTime(new Date(START + 13 * 60 * 60 * 1000));
		const later = await load();
		later.triggerConfetti({ subject: subject("Ada") });
		expect(timers.size).toBe(1);

		expect(globalThis.localStorage.getItem("confetti:last:Ada | ♂️")).toBe(
			dayOf(START),
		);
	});

	test("force lets a deliberate action through, and still stamps the day", async () => {
		const { triggerConfetti } = await load();

		triggerConfetti({ subject: subject("Ada") });
		const reload = await load();
		reload.triggerConfetti({ subject: subject("Ada"), force: true });
		expect(timers.size).toBe(2);

		const later = await load();
		later.triggerConfetti({ subject: subject("Ada") });
		expect(timers.size).toBe(2);
	});

	test("force works on a first-ever burst too", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti({ subject: subject("Ada"), force: true });
		expect(timers.size).toBe(1);
	});

	test("with no subject the throttle falls back to a single shared key", async () => {
		const { triggerConfetti } = await load();

		triggerConfetti();
		const reload = await load();
		reload.triggerConfetti();

		expect(timers.size).toBe(1);
	});

	test("blocked storage neither throws nor disables the throttle", async () => {
		blockedStorage();
		const { triggerConfetti } = await load();

		expect(() => triggerConfetti({ subject: subject("Ada") })).not.toThrow();
		expect(timers.size).toBe(1);

		triggerConfetti({ subject: subject("Ada") });
		expect(timers.size).toBe(1);

		const reload = await load();
		expect(() =>
			reload.triggerConfetti({ subject: subject("Ada") }),
		).not.toThrow();
	});

	test("a localStorage that is simply absent behaves the same way", async () => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			get: () => undefined,
		});
		const { triggerConfetti } = await load();

		triggerConfetti({ subject: subject("Ada") });
		expect(timers.size).toBe(1);
		triggerConfetti({ subject: subject("Ada") });
		expect(timers.size).toBe(1);
	});
});

describe("celebration / burst lifecycle", () => {
	test("the interval runs at 250ms and the burst lasts about five seconds", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });

		const id = onlyTimer();
		expect(timers.get(id)?.ms).toBe(250);

		setSystemTime(new Date(START + 10 * 250));
		tick(id);
		expect(timers.size).toBe(1);
		expect(confettiCalls.length).toBe(2);
	});

	test("the particle count decays as the burst runs out", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });
		const id = onlyTimer();

		setSystemTime(new Date(START + 1000));
		tick(id);
		const early = confettiCalls[0]?.particleCount ?? 0;

		setSystemTime(new Date(START + 4000));
		tick(id);
		const late = confettiCalls[2]?.particleCount ?? 0;

		expect(early).toBeGreaterThan(late);
	});

	test("the interval clears itself once the five seconds are up", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });
		const id = onlyTimer();

		setSystemTime(new Date(START + 5000));
		tick(id);

		expect(cleared).toEqual([id]);
		expect(timers.size).toBe(0);
	});

	test("the returned cleanup clears the interval, and is safe to call twice", async () => {
		const { triggerConfetti } = await load();
		const stop = triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });
		const id = onlyTimer();

		expect(cleared).toEqual([]);

		stop();
		expect(cleared).toEqual([id]);
		expect(timers.size).toBe(0);

		expect(() => stop()).not.toThrow();
		expect(cleared).toEqual([id]);
	});

	test("after an early cleanup, further frames fire nothing", async () => {
		const { triggerConfetti } = await load();
		const stop = triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });
		const id = onlyTimer();

		tick(id);
		const afterOneFrame = confettiCalls.length;
		expect(afterOneFrame).toBe(2);

		stop();
		expect(() => tick(id)).toThrow();
		expect(confettiCalls.length).toBe(afterOneFrame);
	});

	test("an early cleanup does not leave the day stamped twice or crash the next load", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti({ subject: { name: "Ada", kind: "♀️" } })();
		expect(timers.size).toBe(0);

		const reload = await load();
		expect(() =>
			reload.triggerConfetti({ subject: { name: "Ada", kind: "♀️" } }),
		).not.toThrow();
		expect(timers.size).toBe(0);
	});
});

describe("celebration / non-DOM environments", () => {
	test("without a window or a document it is inert, and importing is safe", async () => {
		const { triggerConfetti } = await load();

		globalThis.window = undefined as unknown as Window & typeof globalThis;
		const stop = triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });

		expect(timers.size).toBe(0);
		expect(confettiCalls).toEqual([]);
		expect(typeof stop).toBe("function");
		expect(() => stop()).not.toThrow();
	});

	test("a document without a body still cannot throw", async () => {
		const { triggerConfetti } = await load();
		expect(() => triggerConfetti()).not.toThrow();
	});
});

describe("celebration / stacking and palette", () => {
	test("the canvas is stacked above the sticky header, the grain and modals", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti({ subject: { name: "Ada", kind: "♀️" } });
		tick(onlyTimer());

		const z = confettiCalls[0]?.zIndex ?? 0;
		expect(z).toBeGreaterThan(2000);
	});

	test("the palette follows the record's kind, not a fixed rainbow", async () => {
		const seen = new Map<string, string[]>();
		for (const kind of ["♂️", "♀️", "💒"] as const) {
			const { triggerConfetti } = await load();
			const stop = triggerConfetti({ subject: { name: `P-${kind}`, kind } });
			tick(onlyTimer());
			seen.set(kind, confettiCalls.at(-1)?.colors ?? []);
			stop();
		}

		expect(new Set([...seen.values()].map((c) => c.join(","))).size).toBe(3);
		for (const colors of seen.values()) {
			expect(colors.length).toBeGreaterThan(2);
		}
	});

	test("an unknown subject falls back to the app accent rather than nothing", async () => {
		const { triggerConfetti } = await load();
		triggerConfetti();
		tick(onlyTimer());

		expect(confettiCalls[0]?.colors).toEqual([...confettiPalette()]);
		expect((confettiCalls[0]?.colors ?? []).length).toBeGreaterThan(0);
	});

	test("every colour is legible against BOTH the light and the dark background", async () => {
		const LIGHT = "#f4f4f5";
		const DARK = "#09090b";
		const channel = (v: number) => {
			const c = v / 255;
			return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		};
		const luminance = (hex: string) => {
			const n = Number.parseInt(hex.slice(1), 16);
			return (
				0.2126 * channel((n >> 16) & 0xff) +
				0.7152 * channel((n >> 8) & 0xff) +
				0.0722 * channel(n & 0xff)
			);
		};
		const contrast = (a: string, b: string) => {
			const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
			return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
		};

		const palettes = [
			confettiPalette("♂️"),
			confettiPalette("♀️"),
			confettiPalette("💒"),
			confettiPalette(),
		];

		for (const palette of palettes) {
			for (const color of palette) {
				expect(color).toMatch(/^#[0-9a-f]{6}$/);
				expect({
					color,
					onLight: contrast(color, LIGHT) >= 3,
					onDark: contrast(color, DARK) >= 3,
				}).toEqual({
					color,
					onLight: true,
					onDark: true,
				});
			}
		}
	});

	test("the palettes are not all the same colour", async () => {
		const hues = new Set(
			[confettiPalette("♂️"), confettiPalette("♀️"), confettiPalette("💒")].map(
				(p) => p[0],
			),
		);
		expect(hues.size).toBe(3);
	});
});
