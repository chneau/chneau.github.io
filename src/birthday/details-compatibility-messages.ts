import { useTranslation } from "react-i18next";

/**
 * English text for the compatibility qualifier keys `BirthdayDetails` adds.
 *
 * `locales/*.json` is owned elsewhere, so each key is looked up as a candidate
 * list with this default attached: until a key is translated it degrades to
 * English instead of leaking `"app.compatibility.some_key"` into the UI. Once
 * the keys land in `en.json` the default is simply unused.
 */
const NEW_MESSAGES = {
	"app.compatibility.duplicate_row":
		"This name and date are also saved as {{count}} other entr{{count, plural, one {y} other {ies}} — the data cannot tell them apart, so no match is claimed here.",
	"app.compatibility.same_name_note":
		"{{count}} other entr{{count, plural, one {y}} named {{name}} {{count, plural, one {is} other {are}} listed here; they are separate people, scored on their own zodiac element.",
	"app.compatibility.shared_birthday": "Shared: {{names}}",
} as const;

type CompatibilityMessageKey = keyof typeof NEW_MESSAGES;

type TranslateCompatibilityMessage = (
	key: CompatibilityMessageKey,
	params?: Record<string, string | number>,
) => string;

/**
 * The translator for those three keys, bound to the active language. It is a
 * hook rather than a bare function because the lookup has to happen against the
 * language i18next is currently on, not the one captured at module load.
 */
export const useCompatibilityMessages = (): TranslateCompatibilityMessage => {
	const { t } = useTranslation();
	return (key, params) =>
		t([key], { ...params, defaultValue: NEW_MESSAGES[key] });
};
