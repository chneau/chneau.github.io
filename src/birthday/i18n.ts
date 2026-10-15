import dayjs from "dayjs";
import "dayjs/locale/de";
import "dayjs/locale/es";
import "dayjs/locale/fr";
import "dayjs/locale/gd";
import "dayjs/locale/zh-cn";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import gd from "./locales/gd.json";
import ty from "./locales/ty.json";
import zh from "./locales/zh.json";

// Locales only need to translate the keys they use; untranslated keys fall
// back to English via `fallbackLng`.
type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const resources: Record<string, { translation: DeepPartial<typeof en> }> = {
	en: { translation: en },
	fr: { translation: fr },
	es: { translation: es },
	de: { translation: de },
	gd: { translation: gd },
	ty: { translation: ty },
	zh: { translation: zh },
};

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources,
		load: "languageOnly",
		fallbackLng: "en",
		interpolation: {
			escapeValue: false,
		},
		detection: {
			order: ["localStorage", "navigator"],
			caches: ["localStorage"],
		},
	});

const setDayjsLocale = (lng: string) => {
	const mapping: Record<string, string> = {
		zh: "zh-cn",
		ty: "fr",
	};
	dayjs.locale(mapping[lng] || lng);
};

/**
 * The language the page is *rendering in*, written to the document.
 *
 * The shared HTML template declares `lang="en-GB"`, and this is the one
 * document on the site whose language is not fixed: the app ships seven
 * locales. Without this, a French visitor reads a page that claims to be
 * English — the opposite of the defect the template fixes — because i18next
 * changes the strings and nothing changes the element.
 */
const applyLanguage = (lng: string) => {
	// `resolvedLanguage` and not the value the detector reported: the detector
	// answers "what does this browser prefer", which is not the same question
	// as "which bundle is on screen". A ja-JP visitor is rendered the English
	// strings by `fallbackLng`, so declaring `ja-JP` would have a screen reader
	// pronounce English with Japanese rules — the defect this whole change
	// exists to remove, wearing the other hat. i18next's own `resolvedLanguage`
	// answers `en` there, `fr` for fr-FR (the bundle `load: "languageOnly"`
	// selects), and is undefined only before init has resolved.
	const active = i18n.resolvedLanguage ?? lng;
	setDayjsLocale(active);
	// Guarded because this module is imported by a Node-like test process: it
	// stubs `localStorage` and `navigator` for the language detector
	// (`birthday/tests/notifications.test.ts`) and has no `document` at all.
	// The document element is a browser concern, so its absence is not an
	// error — and an unguarded write here fails that file at import time.
	if (typeof document === "undefined") return;
	document.documentElement.lang = active;
};

applyLanguage(i18n.language);

i18n.on("languageChanged", applyLanguage);

export default i18n;
