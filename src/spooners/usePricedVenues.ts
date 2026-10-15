import { useMemo } from "react";
import { availableCurrencies } from "./derive";
import { metricText } from "./portions";
import { money } from "./price";
import { canConvertTo, convert, type RateTable } from "./rates";
import type { Formatter, PricedVenue, ValueKind } from "./types";

type Input = {
	priced: PricedVenue[];
	selectedCurrency: string | null;
	convertCurrency: string;
	rates: RateTable | null;
};

export const usePricedVenues = ({
	priced,
	selectedCurrency,
	convertCurrency,
	rates,
}: Input) => {
	const currencies = useMemo(() => availableCurrencies(priced), [priced]);
	const effectiveCurrency =
		selectedCurrency &&
		currencies.some((option) => option.code === selectedCurrency)
			? selectedCurrency
			: (currencies.find((option) => option.code === "GBP")?.code ??
				currencies[0]?.code ??
				"GBP");
	const nativeVenues = useMemo(
		() => priced.filter((venue) => venue.currency === effectiveCurrency),
		[priced, effectiveCurrency],
	);

	const convertTo = convertCurrency !== "native" ? convertCurrency : null;
	const allCurrenciesConvertible = priced.every((venue) =>
		canConvertTo(venue.currency, rates),
	);
	const converting = Boolean(
		convertTo && canConvertTo(convertTo, rates) && allCurrenciesConvertible,
	);
	const displayVenues = useMemo(() => {
		if (!(converting && convertTo)) {
			return nativeVenues;
		}
		return priced.map((venue) => {
			const rate = convert(1, venue.currency, convertTo, rates);
			return {
				...venue,
				price: convert(venue.price, venue.currency, convertTo, rates),
				previousPrice:
					venue.previousPrice != null
						? convert(venue.previousPrice, venue.currency, convertTo, rates)
						: null,
				metricValue:
					venue.metricValue == null
						? null
						: venue.metricKind === "calorie"
							? venue.metricValue / rate
							: venue.metricValue * rate,
				lines: venue.lines.map((line) => ({
					...line,
					price: convert(line.price, venue.currency, convertTo, rates),
				})),
				currency: convertTo,
			};
		});
	}, [converting, convertTo, priced, nativeVenues, rates]);
	const displayCurrency =
		converting && convertTo ? convertTo : effectiveCurrency;

	const targetCurrency = converting && convertTo ? convertTo : null;
	const format = useMemo<Formatter>(() => {
		const convertMoney = (value: number, from: string) =>
			targetCurrency ? convert(value, from, targetCurrency, rates) : value;
		const convertMetric = (kind: ValueKind, value: number, from: string) => {
			if (!targetCurrency) {
				return value;
			}
			const rate = convert(1, from, targetCurrency, rates);
			return kind === "calorie" ? value / rate : value * rate;
		};
		return {
			targetCurrency,
			convertMoney,
			convertMetric,
			money: (value, from) =>
				money(convertMoney(value, from), targetCurrency ?? from),
			metric: (kind, value, from) =>
				metricText(
					{ kind, value: convertMetric(kind, value, from) },
					targetCurrency ?? from,
				),
		};
	}, [targetCurrency, rates]);

	return { currencies, converting, displayCurrency, displayVenues, format };
};
