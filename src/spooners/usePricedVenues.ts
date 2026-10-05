import { useMemo } from "react";
import { availableCurrencies } from "./derive";
import { metricText } from "./portions";
import { money } from "./price";
import { canConvertTo, convert, type RateTable } from "./rates";
import type { Formatter, PricedVenue, ValueKind } from "./types";

type Input = {
	/** Pubs that can serve the round, in their own currencies. */
	priced: PricedVenue[];
	selectedCurrency: string | null;
	/** The "prices shown in" setting: "native" or an ISO code. */
	convertCurrency: string;
	rates: RateTable | null;
};

/**
 * The round's price in one currency.
 *
 * Two modes, and the difference matters: `native` keeps each pub in its own
 * currency and switches between them, while a chosen currency converts
 * everything so EUR pubs show up beside GBP ones. Both need to know which
 * currency is actually available, because the app's own currency list can be
 * empty before the data lands.
 */
export const usePricedVenues = ({
	priced,
	selectedCurrency,
	convertCurrency,
	rates,
}: Input) => {
	// native mode: each pub keeps its own currency (switch between them)
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

	// converted mode: everything into one currency, so EUR pubs show up too
	const convertTo = convertCurrency !== "native" ? convertCurrency : null;
	// `convert` silently returns the amount unchanged when a venue's own
	// currency is missing from the table, which would mix currencies - so only
	// convert when every pub can be converted.
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
				// kcal/£ and £/unit both scale with the currency
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

	// one place that knows how to show a price/metric in the display currency
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
