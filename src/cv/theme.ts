import { initTheme } from "../shared";

/** Per-app key for the shared light/dark/auto theme store. */
export const CV_THEME_KEY = "chneau_cv_theme";

/**
 * Apply the stored theme before the first paint. Older CV builds wrote a bare
 * `"dark"`/`"light"` string to the same key; the shared store reads JSON, so
 * migrate that value in place first to avoid losing the visitor's choice.
 */
export const initCvTheme = (): void => {
	try {
		const raw = localStorage.getItem(CV_THEME_KEY);
		if (raw === "dark" || raw === "light") {
			localStorage.setItem(CV_THEME_KEY, JSON.stringify(raw));
		}
	} catch {
		// Storage blocked: initTheme still resolves the OS preference.
	}
	initTheme(CV_THEME_KEY);
};
