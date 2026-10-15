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
 * The document's own language, kept true as i18next switches.
 *
 * The shared HTML template declares `lang="en-GB"`, and this is the one
 * document on the site whose language is not fixed: the app ships seven
 * locales. Without this, a French visitor reads a page that claims to be
 * English — the opposite of the defect the template fixes — because i18next
 * changes the strings and nothing changes the element.
 */
const applyLanguage = (lng: string) => {
	setDayjsLocale(lng);
	document.documentElement.lang = lng;
};

applyLanguage(i18n.language);

i18n.on("languageChanged", applyLanguage);

export default i18n;
