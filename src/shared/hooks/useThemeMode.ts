import { useEffect, useState } from "react";
import { type PersistOptions, usePersistentState } from "./usePersistentState";

/** What the user picked; `auto` follows the operating system. */
export type ColorMode = "light" | "dark" | "auto";

export type ResolvedColorMode = "light" | "dark";

const MEDIA = "(prefers-color-scheme: dark)";
const DEFAULT_THEME_KEY = "app_theme_mode";

/** Storage key the dashboard uses; kept for backwards compatibility. */
export const ROOT_THEME_KEY = "root_dark_mode";

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

/** Apply the scheme to `<html>` so the CSS tokens and Mantine both react. */
export const applyColorMode = (mode: ResolvedColorMode): void => {
	if (typeof document === "undefined") return;
	document.documentElement.dataset.theme = mode;
	// Mantine reads `data-mantine-color-scheme`; set it too so apps that use
	// `useMantineColorScheme` (rather than `forceColorScheme`) stay in sync.
	document.documentElement.dataset.mantineColorScheme = mode;
};

/** Decode a stored mode, accepting the legacy boolean format. */
const parseMode = (raw: string): ColorMode => {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (parsed === "dark" || parsed === "light" || parsed === "auto") {
			return parsed;
		}
		// Legacy values stored as a bare boolean or the strings "true"/"false".
		if (parsed === true) return "dark";
		if (parsed === false) return "light";
	} catch {
		// Not JSON: treat as unset.
	}
	return "auto";
};

const readStored = (key: string): ColorMode => {
	if (typeof localStorage === "undefined") return "auto";
	try {
		const raw = localStorage.getItem(key);
		return raw == null ? "auto" : parseMode(raw);
	} catch {
		return "auto";
	}
};

// Module-stable option object (see `usePersistentState`).
const MODE_OPTIONS: PersistOptions<ColorMode> = { deserialize: parseMode };

/**
 * Shared light/dark/auto theme state. Persists the choice, tracks the OS
 * preference when the choice is `auto`, mirrors it onto `<html data-theme>` and
 * returns a boolean `dark` for `forceColorScheme`.
 *
 * @param key storage key; pass a per-app key so themes do not bleed between apps
 */
export const useThemeMode = (key: string = DEFAULT_THEME_KEY) => {
	const [mode, setMode] = usePersistentState<ColorMode>(
		key,
		readStored(key),
		MODE_OPTIONS,
	);
	const [systemDark, setSystemDark] = useState(systemPrefersDark);

	useEffect(() => {
		if (typeof window === "undefined" || !("matchMedia" in window)) return;
		const query = window.matchMedia(MEDIA);
		const onChange = () => setSystemDark(query.matches);
		onChange();
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

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
		toggle: () => setMode(dark ? "light" : "dark"),
	};
};

/**
 * Runs before React mounts to apply the stored theme on the first paint and
 * avoid a flash of the wrong colours. Call once from each app entrypoint.
 */
export const initTheme = (key: string = DEFAULT_THEME_KEY): void => {
	applyColorMode(resolveColorMode(readStored(key), systemPrefersDark()));
};
