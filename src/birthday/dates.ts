import dayjs from "dayjs";

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

export const shortDate = (date: Date, language: string): string =>
	formatDate(
		date,
		language,
		{ day: "numeric", month: "short" },
		dayjs(date).format("D MMM"),
	);
