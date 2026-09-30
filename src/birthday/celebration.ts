import confetti from "canvas-confetti";
import dayjs from "dayjs";
import type { Birthday } from "./birthdays";

/** The three kinds of celebration the dataset can hold. */
type Kind = Birthday["kind"];

/** Everything the effect needs to know about who is being celebrated. */
type ConfettiSubject = Pick<Birthday, "name" | "kind">;

type ConfettiOptions = {
	/**
	 * The record being celebrated. Drives the palette and the throttle key, so
	 * pass it whenever the caller knows who it is.
	 */
	subject?: ConfettiSubject;
	/**
	 * Bypass the once-a-calendar-day throttle. For deliberate, user-initiated
	 * actions ("simulate a celebration") only: a page load must never set it.
	 */
	force?: boolean;
};

const DURATION_MS = 5_000;
const FRAME_MS = 250;

/**
 * The confetti canvas is appended to `document.body` as a sibling of the app
 * shell, so its stacking is decided by its own `z-index` alone. The layers it
 * has to clear, in the order they are declared:
 *
 *   `.app-header`     40   sticky top bar
 *   `.app-grain`      60   fixed film grain over the whole viewport
 *   Mantine modals   200   Manage birthdays
 *   `.app-skip-link` 2000
 *
 * 3000 sits above all of them. The old value of 0 put the canvas *underneath*
 * every one of them, which is why the effect was never actually seen.
 */
const CONFETTI_Z_INDEX = 3_000;

/**
 * Colours chosen for both themes at once, not for one of them.
 *
 * The app flips `--app-bg` between `#f4f4f5` (light) and `#09090b` (dark) —
 * about 18 stops of relative luminance apart. A colour only stays legible
 * across that whole range if it sits in the narrow middle band where it clears
 * the 3:1 non-text contrast floor against *both* backgrounds, which is what
 * every entry below is picked for. Each kind gets a hue of its own rather than
 * one fixed rainbow, so the burst reads as being for someone in particular.
 */
const PALETTES = {
	"♂️": ["#2f7de1", "#0c71e4", "#3b82f6", "#0284c7", "#0369a1"],
	"♀️": ["#db2777", "#e11d8f", "#e11d48", "#c026d3", "#be185d"],
	"💒": ["#a16207", "#b45309", "#936f1a", "#8b7418", "#8b6818"],
} as const satisfies Record<Kind, readonly string[]>;

/** Used when the caller could not say who it is celebrating. */
const DEFAULT_PALETTE: readonly string[] = [
	"#0f9d76",
	"#059669",
	"#1b8364",
	"#047857",
];

/** The confetti colours for a record's kind. Exported for the contrast test. */
export const confettiPalette = (kind?: Kind): readonly string[] => {
	if (kind === "♂️") return PALETTES["♂️"];
	if (kind === "♀️") return PALETTES["♀️"];
	if (kind === "💒") return PALETTES["💒"];
	return DEFAULT_PALETTE;
};

const STORAGE_PREFIX = "confetti:last:";

/** One day per person; the anonymous key stands in for "whoever it is". */
const throttleKeyFor = (subject?: ConfettiSubject): string =>
	subject
		? `${STORAGE_PREFIX}${subject.name} | ${subject.kind}`
		: `${STORAGE_PREFIX}*`;

/** `YYYY-MM-DD` in local time: the throttle is per calendar day, per person. */
const today = (): string => dayjs().format("YYYY-MM-DD");

/**
 * `localStorage` is absent under SSR/prerender, and throws rather than
 * returning null in private mode and when site data is blocked. The map below
 * is the fallback, so a session is still throttled even when nothing persists.
 */
const sessionThrottle = new Map<string, string>();

const readStamp = (key: string): string | null => {
	try {
		if (typeof localStorage !== "undefined") {
			const stored = localStorage.getItem(key);
			if (stored !== null) return stored;
		}
	} catch {
		// storage blocked: fall through to the in-session record
	}
	return sessionThrottle.get(key) ?? null;
};

const writeStamp = (key: string, value: string): void => {
	sessionThrottle.set(key, value);
	try {
		if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
	} catch {
		// storage blocked: the in-session record above is all we get
	}
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Whether the user has asked the OS to minimise motion.
 *
 * `matchMedia` is not a given: it is missing under SSR/prerender and in some
 * embedded webviews, and a hostile implementation can throw. Absent means "no
 * preference expressed", which must not be read as a request for less motion.
 */
const prefersReducedMotion = (): boolean => {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return false;
	}
	try {
		return window.matchMedia(REDUCED_MOTION).matches;
	} catch {
		return false;
	}
};

const NOOP = () => {};

/**
 * Fire a five-second confetti burst for someone's celebration.
 *
 * Returns a stop function that halts the burst; calling it more than once is
 * fine, and unmounting is exactly when a caller should call it. The returned
 * function is always callable, including on the paths that decide not to
 * animate at all, so a caller never has to know which of those happened.
 */
export const triggerConfetti = (
	options: ConfettiOptions = {},
): (() => void) => {
	const { subject, force = false } = options;

	// Prerender: there is no document to append a canvas to and no clock worth
	// starting. Importing this module has to stay free of side effects.
	if (typeof window === "undefined" || typeof document === "undefined") {
		return NOOP;
	}

	// A five-second full-screen particle storm is precisely the kind of motion
	// `prefers-reduced-motion` exists to suppress, so this is a hard stop
	// rather than a gentler, shorter version of the same thing.
	if (prefersReducedMotion()) return NOOP;

	const key = throttleKeyFor(subject);
	if (!force && readStamp(key) === today()) return NOOP;
	// A deliberate `force` still stamps the day: the celebration has happened.
	writeStamp(key, today());

	const animationEnd = Date.now() + DURATION_MS;
	const defaults = {
		startVelocity: 30,
		spread: 360,
		ticks: 60,
		colors: [...confettiPalette(subject?.kind)],
		zIndex: CONFETTI_Z_INDEX,
		// Belt and braces only. The library's own probe is
		// `matchMedia("(prefers-reduced-motion)")` — without the `: reduce`
		// qualifier, so it never matches in any browser. The check above is the
		// one that actually does the work.
		disableForReducedMotion: true,
	} satisfies confetti.Options;

	const randomInRange = (min: number, max: number) =>
		Math.random() * (max - min) + min;

	// `stop` is declared before the interval so it is always in scope, and so
	// the cleanup a caller receives is the very same closure the timer uses to
	// end itself: one interval, one way to clear it, no double-clear.
	let interval: ReturnType<typeof setInterval> | undefined;
	const stop = () => {
		if (interval === undefined) return;
		clearInterval(interval);
		interval = undefined;
	};

	interval = setInterval(() => {
		const timeLeft = animationEnd - Date.now();

		if (timeLeft <= 0) {
			stop();
			return;
		}

		const particleCount = 50 * (timeLeft / DURATION_MS);
		confetti({
			...defaults,
			particleCount,
			origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
		});
		confetti({
			...defaults,
			particleCount,
			origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
		});
	}, FRAME_MS);

	return stop;
};
