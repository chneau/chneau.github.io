import { useTranslation } from "react-i18next";

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

export const useCompatibilityMessages = (): TranslateCompatibilityMessage => {
	const { t } = useTranslation();
	return (key, params) =>
		t([key], { ...params, defaultValue: NEW_MESSAGES[key] });
};
