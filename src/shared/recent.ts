import { useCallback } from "react";
import {
	type PersistOptions,
	usePersistentState,
} from "./hooks/usePersistentState";

export type RecentApp = {
	href: string;
	at: number;
};

const RECENTS_KEY = "app_recents";
const PINNED_KEY = "app_pinned";

export const MAX_RECENTS = 4;

export const MAX_PINS = 8;

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

export const togglePinned = (list: string[], href: string): string[] =>
	list.includes(href)
		? list.filter((entry) => entry !== href)
		: [href, ...list].slice(0, MAX_PINS);

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

const parseJson = (raw: string): unknown => {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
};

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

export const parseRecents = (raw: string): RecentApp[] => {
	const parsed: unknown = parseJson(raw);
	if (!Array.isArray(parsed)) return [];
	return parsed.filter(isRecentApp).slice(0, MAX_RECENTS);
};

export const parsePinned = (raw: string): string[] => {
	const parsed: unknown = parseJson(raw);
	if (!Array.isArray(parsed)) return [];
	return [
		...new Set(parsed.filter((entry): entry is string => isAppHref(entry))),
	].slice(0, MAX_PINS);
};

const RECENTS_OPTIONS: PersistOptions<RecentApp[]> = {
	deserialize: parseRecents,
};
const PINNED_OPTIONS: PersistOptions<string[]> = { deserialize: parsePinned };

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
