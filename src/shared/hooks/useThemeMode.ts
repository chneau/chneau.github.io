import { useEffect, useSyncExternalStore } from "react";
import {
	type PersistOptions,
	storage,
	usePersistentState,
} from "./usePersistentState";

export type ColorMode = "light" | "dark" | "auto";

export type ResolvedColorMode = "light" | "dark";

const MEDIA = "(prefers-color-scheme: dark)";

export const THEME_MODE_KEY = "app_theme_mode";

const LEGACY_THEME_KEYS: readonly string[] = [
	"root_dark_mode",
	"chneau_cv_theme",
	"design_dark_mode",
];

export const ROOT_THEME_KEY = "root_dark_mode";

export const resolveColorMode = (
	mode: ColorMode,
	systemPrefersDark: boolean,
): ResolvedColorMode =>
	mode === "auto" ? (systemPrefersDark ? "dark" : "light") : mode;

export const systemPrefersDark = (): boolean =>
	typeof window !== "undefined" && "matchMedia" in window
		? window.matchMedia(MEDIA).matches
		: false;

export const applyColorMode = (mode: ResolvedColorMode): void => {
	if (typeof document === "undefined") return;
	document.documentElement.dataset.theme = mode;
	document.documentElement.dataset.mantineColorScheme = mode;
};

const decodeMode = (raw: string): ColorMode | undefined => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = raw;
	}
	if (parsed === "dark" || parsed === "light" || parsed === "auto") {
		return parsed;
	}
	if (parsed === true) return "dark";
	if (parsed === false) return "light";
	return undefined;
};

const parseMode = (raw: string): ColorMode => decodeMode(raw) ?? "auto";

const readKey = (key: string): ColorMode | undefined => {
	const raw = storage()?.getItem(key);
	return raw == null ? undefined : decodeMode(raw);
};

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
	} catch {}
};

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
		mode,
		resolved,
		dark,
		setMode,
		toggle: () => setMode(dark ? "light" : "dark"),
		reset: () => setMode("auto"),
	};
};

export const initTheme = (legacyKey?: string): void => {
	migrateLegacyTheme(legacyKey);
	const mode = readKey(THEME_MODE_KEY) ?? "auto";
	applyColorMode(resolveColorMode(mode, systemPrefersDark()));
};
