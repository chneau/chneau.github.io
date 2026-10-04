import dayjs from "dayjs";

/**
 * Locale-aware date formatter. `Intl` follows each language's field order,
 * which `dayjs().format("D MMM")` cannot: it always puts the day number first,
 * even in locales that write the month first. `Intl` throws for a language tag
 * it does not recognise, so the caller passes the `dayjs`-formatted `fallback`
 * to use in that case.
 */
export const formatDate = (
	date: Date,
	language: string,
	options: Intl.DateTimeFormatOptions,
	fallback: string,
): string => {
	try {
		return new Intl.DateTimeFormat(language, options).format(date);
	} catch {
		return fallback;
	}
};

/**
 * The short "day month" form used wherever the date is secondary to the name,
 * falling back to `dayjs`'s `D MMM` for a language `Intl` does not know.
 */
export const shortDate = (date: Date, language: string): string =>
	formatDate(
		date,
		language,
		{ day: "numeric", month: "short" },
		dayjs(date).format("D MMM"),
	);
