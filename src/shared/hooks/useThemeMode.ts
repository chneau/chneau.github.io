import { useEffect, useSyncExternalStore } from "react";
import { type PersistOptions, usePersistentState } from "./usePersistentState";

/** What the user picked; `auto` follows the operating system. */
export type ColorMode = "light" | "dark" | "auto";

export type ResolvedColorMode = "light" | "dark";

const MEDIA = "(prefers-color-scheme: dark)";

/**
 * The one `localStorage` key the whole site uses for theme mode.
 *
 * Theme mode is a site-wide preference, not a per-app one: picking dark in the
 * CV must not leave the dashboard light. A *missing* key means "no explicit
 * choice yet" — so a first visit resolves against the OS, and keeps following
 * the OS until the visitor picks a scheme for themselves. Once they have, the
 * stored value is an explicit `light`/`dark` and the OS is ignored for good.
 */
const THEME_MODE_KEY = "app_theme_mode";

/**
 * Per-app keys that predate {@link THEME_MODE_KEY}. Each is consumed at most
 * once — folded into the shared key and then deleted — so an existing visitor
 * keeps the scheme they already chose without leaving a stale store behind.
 */
const LEGACY_THEME_KEYS: readonly string[] = [
	"root_dark_mode",
	"chneau_cv_theme",
	"design_dark_mode",
];

/** @deprecated A legacy per-app key; see {@link LEGACY_THEME_KEYS}. */
export const ROOT_THEME_KEY = "root_dark_mode";

/** `localStorage`, or `undefined` when it is missing or blocked. */
const storage = (): Storage | undefined => {
	try {
		return typeof window === "undefined" ? undefined : window.localStorage;
	} catch {
		// Private mode / sandboxed iframe: callers fall back to the OS.
		return undefined;
	}
};

/** Resolve `auto` against the current OS preference. */
export const resolveColorMode = (
	mode: ColorMode,
	systemPrefersDark: boolean,
): ResolvedColorMode =>
	mode === "auto" ? (systemPrefersDark ? "dark" : "light") : mode;

/** Read the OS preference, safely in non-browser environments. */
export const systemPrefersDark = (): boolean =>
	typeof window !== "undefined" && "matchMedia" in window
		? window.matchMedia(MEDIA).matches
		: false;

/**
 * Apply the scheme to `<html>` so both halves of the token layer react.
 *
 * `data-mantine-color-scheme` is what Mantine 9 reads; `data-theme` is the
 * legacy attribute that `tokens.css` and `base.css` still key off. They are
 * always written together — a single `applyColorMode` call is the only place in
 * the codebase that decides which scheme is active.
 */
export const applyColorMode = (mode: ResolvedColorMode): void => {
	if (typeof document === "undefined") return;
	document.documentElement.dataset.theme = mode;
	document.documentElement.dataset.mantineColorScheme = mode;
};

/**
 * Decode a stored mode, accepting every format the site has written: JSON
 * mode strings, the older bare `dark`/`light` words, and bare booleans.
 *
 * Returns `undefined` for anything unrecognised so callers can tell "no choice"
 * apart from an explicit choice.
 */
const decodeMode = (raw: string): ColorMode | undefined => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// Not JSON: pre-JSON builds stored the word unquoted.
		parsed = raw;
	}
	if (parsed === "dark" || parsed === "light" || parsed === "auto") {
		return parsed;
	}
	if (parsed === true) return "dark";
	if (parsed === false) return "light";
	return undefined;
};

/** `usePersistentState` deserializer: unknown values fall back to `auto`. */
const parseMode = (raw: string): ColorMode => decodeMode(raw) ?? "auto";

/** Read one key; `undefined` means absent or unusable. */
const readKey = (key: string): ColorMode | undefined => {
	const raw = storage()?.getItem(key);
	return raw == null ? undefined : decodeMode(raw);
};

/**
 * Fold the pre-single-key stores into {@link THEME_MODE_KEY}.
 *
 * A legacy key only wins while it still holds an *explicit* choice, and it is
 * deleted as soon as it is consumed, so it can never override a later toggle
 * on the shared key. Everything else is left to {@link THEME_MODE_KEY}, and an
 * absent key stays absent so the OS keeps driving the scheme.
 *
 * Idempotent and cheap: once the legacy keys are gone this is one `getItem`.
 * Call it before the first read of the shared store.
 */
const migrateLegacyTheme = (
	...legacyKeys: readonly (string | undefined)[]
): void => {
	const store = storage();
	if (!store) return;
	try {
		const candidates = [
			...legacyKeys.filter((key): key is string => key != null),
			...LEGACY_THEME_KEYS,
		];
		for (const key of candidates) {
			const mode = readKey(key);
			if (mode === undefined) continue;
			store.removeItem(key);
			if (mode === "auto") continue;
			store.setItem(THEME_MODE_KEY, JSON.stringify(mode));
			return;
		}
	} catch {
		// Storage blocked: the site simply follows the OS preference.
	}
};

// Module-stable option object (see `usePersistentState`).
const MODE_OPTIONS: PersistOptions<ColorMode> = { deserialize: parseMode };

const subscribeSystemPreference = (onChange: () => void): (() => void) => {
	if (typeof window === "undefined" || !("matchMedia" in window)) {
		return () => {};
	}
	const query = window.matchMedia(MEDIA);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
};

const getServerSystemPreference = (): boolean => false;

/**
 * Shared light/dark/auto theme state — the single source of truth for every
 * app on the site.
 *
 * Persists the choice in one `localStorage` key, follows the OS while the
 * choice is `auto`, mirrors the resolved scheme onto `<html>` (both
 * `data-theme` and `data-mantine-color-scheme`) and returns a boolean `dark`
 * for `forceColorScheme`.
 *
 * The OS preference is read through `useSyncExternalStore`, so the very first
 * render already agrees with what {@link initTheme} painted — there is no
 * mismatch to correct after mount, and no flash of the wrong theme.
 *
 * @param legacyKey pre-single-key store to migrate from. Ignored as a storage
 * location; kept only so older call sites keep compiling.
 */
export const useThemeMode = (legacyKey?: string) => {
	migrateLegacyTheme(legacyKey);

	const [mode, setMode] = usePersistentState<ColorMode>(
		THEME_MODE_KEY,
		"auto",
		MODE_OPTIONS,
	);
	const systemDark = useSyncExternalStore(
		subscribeSystemPreference,
		systemPrefersDark,
		getServerSystemPreference,
	);

	const resolved = resolveColorMode(mode, systemDark);
	const dark = resolved === "dark";

	useEffect(() => {
		applyColorMode(resolved);
	}, [resolved]);

	return {
		/** User choice: `light`, `dark` or `auto`. */
		mode,
		/** Concrete scheme after resolving `auto`. */
		resolved,
		/** Convenience boolean for `forceColorScheme={dark ? "dark" : "light"}`. */
		dark,
		setMode,
		/** An explicit light/dark choice, so the OS stops being followed. */
		toggle: () => setMode(dark ? "light" : "dark"),
		/** Drop the explicit choice and go back to following the OS. */
		reset: () => setMode("auto"),
	};
};

/**
 * Runs before React mounts to apply the stored theme on the first paint and
 * avoid a flash of the wrong colours. Call once from each app entrypoint.
 *
 * @param legacyKey pre-single-key store to migrate from; see
 * {@link useThemeMode}.
 */
export const initTheme = (legacyKey?: string): void => {
	migrateLegacyTheme(legacyKey);
	const mode = readKey(THEME_MODE_KEY) ?? "auto";
	applyColorMode(resolveColorMode(mode, systemPrefersDark()));
};
