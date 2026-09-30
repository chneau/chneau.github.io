import { useCallback } from "react";
import {
	type PersistOptions,
	usePersistentState,
} from "./hooks/usePersistentState";

/**
 * "Recently opened" and "pinned" apps for the dashboard, persisted per browser.
 * The list maths are pure so they can be unit tested without a DOM.
 */

export type RecentApp = {
	/** App href, e.g. `/spooners/`. */
	href: string;
	/** Unix milliseconds of the last visit. */
	at: number;
};

const RECENTS_KEY = "app_recents";
const PINNED_KEY = "app_pinned";

/** How many recently-opened apps are stored and surfaced. */
export const MAX_RECENTS = 4;

/**
 * Upper bound on stored pins. The registry only has seven entries, so this is
 * generous; it exists so a hand-edited or hostile payload cannot grow without
 * limit.
 */
export const MAX_PINS = 8;

/** Move `href` to the front of the recency list, capping its length. */
export const addRecent = (
	list: RecentApp[],
	href: string,
	at: number,
	limit: number = MAX_RECENTS,
): RecentApp[] =>
	[{ href, at }, ...list.filter((entry) => entry.href !== href)].slice(
		0,
		limit,
	);

/** Add `href` if absent, remove it if present (favourite toggle). */
export const togglePinned = (list: string[], href: string): string[] =>
	list.includes(href)
		? list.filter((entry) => entry !== href)
		: [href, ...list].slice(0, MAX_PINS);

/**
 * Human-friendly "time ago" for a past timestamp, e.g. `just now`, `5m`,
 * `3h`, `2d`, `4w`, then a date for anything older.
 */
export const formatRelativeTime = (
	at: number,
	now: number = Date.now(),
): string => {
	const seconds = Math.max(0, Math.round((now - at) / 1000));
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days}d ago`;
	const weeks = Math.round(days / 7);
	if (weeks < 5) return `${weeks}w ago`;
	return new Date(at).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
};

/**
 * `JSON.parse` that yields `undefined` instead of throwing, so a truncated or
 * hand-edited value degrades to "nothing stored" at the call site instead of
 * having to be wrapped in a try/catch at every reader.
 */
const parseJson = (raw: string): unknown => {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
};

/**
 * A stored href must be a same-origin absolute path. This is not paranoia
 * about `javascript:` URLs so much as keeping the rendered list honest: a
 * stored entry that no longer matches the registry is dropped by the callers
 * anyway, and a malformed one should not reach an `href` attribute.
 */
const isAppHref = (value: unknown): value is string =>
	typeof value === "string" && value.startsWith("/") && !value.startsWith("//");

const isRecentApp = (value: unknown): value is RecentApp => {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<RecentApp>;
	return (
		isAppHref(candidate.href) &&
		typeof candidate.at === "number" &&
		Number.isFinite(candidate.at)
	);
};

/**
 * Decode a stored recents payload. Anything that is not a well-formed array of
 * `{ href, at }` entries is discarded, and the result is always bounded — a
 * corrupt, truncated or hand-edited value degrades to a shorter list, never to
 * a throw.
 */
export const parseRecents = (raw: string): RecentApp[] => {
	const parsed: unknown = parseJson(raw);
	if (!Array.isArray(parsed)) return [];
	return parsed.filter(isRecentApp).slice(0, MAX_RECENTS);
};

/** Decode a stored pins payload, with the same tolerance and bound. */
export const parsePinned = (raw: string): string[] => {
	const parsed: unknown = parseJson(raw);
	if (!Array.isArray(parsed)) return [];
	// De-duplicate as well as filter: a payload repeated by an old buggy build
	// would otherwise pin the same app several times over.
	return [
		...new Set(parsed.filter((entry): entry is string => isAppHref(entry))),
	].slice(0, MAX_PINS);
};

// Module-stable option objects so the hook callbacks keep a stable identity.
const RECENTS_OPTIONS: PersistOptions<RecentApp[]> = {
	deserialize: parseRecents,
};
const PINNED_OPTIONS: PersistOptions<string[]> = { deserialize: parsePinned };

/** Recently opened apps, newest first. */
export const useRecents = () => {
	const [recents, setRecents] = usePersistentState<RecentApp[]>(
		RECENTS_KEY,
		[],
		RECENTS_OPTIONS,
	);

	const visit = useCallback(
		(href: string) => {
			setRecents((list) => addRecent(list, href, Date.now()));
		},
		[setRecents],
	);

	const clear = useCallback(() => setRecents([]), [setRecents]);

	return { recents, visit, clear };
};

/** Favourite/pinned apps, newest first. */
export const usePinnedApps = () => {
	const [pinned, setPinned] = usePersistentState<string[]>(
		PINNED_KEY,
		[],
		PINNED_OPTIONS,
	);

	const toggle = useCallback(
		(href: string) => setPinned((list) => togglePinned(list, href)),
		[setPinned],
	);

	const isPinned = useCallback(
		(href: string) => pinned.includes(href),
		[pinned],
	);

	return { pinned, toggle, isPinned };
};
