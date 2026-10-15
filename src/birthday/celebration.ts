import confetti from "canvas-confetti";
import dayjs from "dayjs";
import type { Birthday } from "./birthdays";

type Kind = Birthday["kind"];

type ConfettiSubject = Pick<Birthday, "name" | "kind">;

type ConfettiOptions = {
	subject?: ConfettiSubject;
	force?: boolean;
};

const DURATION_MS = 5_000;
const FRAME_MS = 250;

const CONFETTI_Z_INDEX = 3_000;

const PALETTES = {
	"♂️": ["#2f7de1", "#0c71e4", "#3b82f6", "#0284c7", "#0369a1"],
	"♀️": ["#db2777", "#e11d8f", "#e11d48", "#c026d3", "#be185d"],
	"💒": ["#a16207", "#b45309", "#936f1a", "#8b7418", "#8b6818"],
} as const satisfies Record<Kind, readonly string[]>;

const DEFAULT_PALETTE: readonly string[] = [
	"#0f9d76",
	"#059669",
	"#1b8364",
	"#047857",
];

export const confettiPalette = (kind?: Kind): readonly string[] => {
	if (kind === "♂️") return PALETTES["♂️"];
	if (kind === "♀️") return PALETTES["♀️"];
	if (kind === "💒") return PALETTES["💒"];
	return DEFAULT_PALETTE;
};

const STORAGE_PREFIX = "confetti:last:";

const throttleKeyFor = (subject?: ConfettiSubject): string =>
	subject
		? `${STORAGE_PREFIX}${subject.name} | ${subject.kind}`
		: `${STORAGE_PREFIX}*`;

const today = (): string => dayjs().format("YYYY-MM-DD");

const sessionThrottle = new Map<string, string>();

const readStamp = (key: string): string | null => {
	try {
		if (typeof localStorage !== "undefined") {
			const stored = localStorage.getItem(key);
			if (stored !== null) return stored;
		}
	} catch {}
	return sessionThrottle.get(key) ?? null;
};

const writeStamp = (key: string, value: string): void => {
	sessionThrottle.set(key, value);
	try {
		if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
	} catch {}
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

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

export const triggerConfetti = (
	options: ConfettiOptions = {},
): (() => void) => {
	const { subject, force = false } = options;

	if (typeof window === "undefined" || typeof document === "undefined") {
		return NOOP;
	}

	if (prefersReducedMotion()) return NOOP;

	const key = throttleKeyFor(subject);
	if (!force && readStamp(key) === today()) return NOOP;
	writeStamp(key, today());

	const animationEnd = Date.now() + DURATION_MS;
	const defaults = {
		startVelocity: 30,
		spread: 360,
		ticks: 60,
		colors: [...confettiPalette(subject?.kind)],
		zIndex: CONFETTI_Z_INDEX,
		disableForReducedMotion: true,
	} satisfies confetti.Options;

	const randomInRange = (min: number, max: number) =>
		Math.random() * (max - min) + min;

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
