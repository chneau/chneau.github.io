import type { Category } from "./data/types";

/** Playback speeds offered by the UI (and accepted from deep links). */
const SPEEDS = [0.5, 1, 2, 5, 15] as const;

type Speed = (typeof SPEEDS)[number];

const CATEGORY_VALUES: readonly (Category | "all")[] = [
	"all",
	"Express",
	"Highland",
	"Commuter",
	"CrossBorder",
	"Sleeper",
];

const DEFAULT_TIME = 480;
const DEFAULT_SPEED = 2;
const DEFAULT_CATEGORY: Category | "all" = "all";

type RailUrlState = {
	timeOffset?: number;
	speed?: Speed;
	serviceId?: string;
	category?: Category | "all";
	query?: string;
};

const clampTime = (value: number): number =>
	Math.min(1440, Math.max(300, Math.round(value)));

/** Parse the shareable subset of the store from the current query string. */
export const readUrlState = (): RailUrlState => {
	if (typeof window === "undefined") return {};
	const params = new URLSearchParams(window.location.search);
	const state: RailUrlState = {};

	const t = params.get("t");
	if (t !== null) {
		const parsed = Number(t);
		if (Number.isFinite(parsed)) state.timeOffset = clampTime(parsed);
	}

	const sp = params.get("sp");
	if (sp !== null) {
		const parsed = Number(sp);
		if ((SPEEDS as readonly number[]).includes(parsed)) {
			state.speed = parsed as Speed;
		}
	}

	const svc = params.get("svc");
	if (svc) state.serviceId = svc;

	const cat = params.get("cat");
	if (cat && (CATEGORY_VALUES as readonly string[]).includes(cat)) {
		state.category = cat as Category | "all";
	}

	const q = params.get("q");
	if (q !== null) state.query = q;

	return state;
};

type RailUrlValues = {
	timeOffset: number;
	speed: number;
	serviceId: string | null;
	category: Category | "all";
	query: string;
};

/**
 * Persist the shareable store values, preserving any unrelated query params
 * that other features may have added.
 */
export const writeUrlState = (values: RailUrlValues): void => {
	if (typeof window === "undefined") return;
	const params = new URLSearchParams(window.location.search);

	const setOrDelete = (key: string, value: string | null) => {
		if (value === null || value === "") params.delete(key);
		else params.set(key, value);
	};

	const time = clampTime(values.timeOffset);
	setOrDelete("t", time === DEFAULT_TIME ? null : String(time));
	setOrDelete(
		"sp",
		values.speed === DEFAULT_SPEED ? null : String(values.speed),
	);
	setOrDelete("svc", values.serviceId);
	setOrDelete(
		"cat",
		values.category === DEFAULT_CATEGORY ? null : values.category,
	);
	setOrDelete("q", values.query);

	const query = params.toString();
	const url = `${window.location.pathname}${
		query ? `?${query}` : ""
	}${window.location.hash}`;
	// Safari throttles `replaceState` (≈100 calls / 30 s) and throws a
	// `SecurityError` once the budget is exhausted. Never let URL mirroring
	// take down the replay: a stale address bar is harmless, a crash is not.
	try {
		window.history.replaceState(null, "", url);
	} catch {
		// ignore SecurityError / DataCloneError from aggressive URL syncing
	}
};
