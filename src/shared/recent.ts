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

/** How many recently-opened apps the dashboard surfaces. */
const MAX_RECENTS = 4;

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
		: [href, ...list];

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

const isRecentApp = (value: unknown): value is RecentApp => {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<RecentApp>;
	return typeof candidate.href === "string" && typeof candidate.at === "number";
};

const parseRecents = (raw: string): RecentApp[] => {
	const parsed: unknown = JSON.parse(raw);
	if (!Array.isArray(parsed)) return [];
	return parsed.filter(isRecentApp).slice(0, MAX_RECENTS);
};

const parsePinned = (raw: string): string[] => {
	const parsed: unknown = JSON.parse(raw);
	if (!Array.isArray(parsed)) return [];
	return parsed.filter((entry): entry is string => typeof entry === "string");
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
