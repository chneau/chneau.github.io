import dayjs from "dayjs";
import { Gem, Mars, RotateCcw, Search, Venus, X } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { useCalendarDay } from "../hooks/useToday";
import { birthdays } from "./birthdays";
import {
	clearFacets,
	dataStore,
	isMonthFacetActive,
	store,
	toggleAgeGroupFacet,
	toggleGenerationFacet,
	toggleMonthFacet,
} from "./store";

const FILTERS = [
	{ key: "showBoys", labelKey: "app.filters.boys", Icon: Mars },
	{ key: "showGirls", labelKey: "app.filters.girls", Icon: Venus },
	{ key: "showWeddings", labelKey: "app.filters.weddings", Icon: Gem },
] as const;

export const FilterButtons = () => {
	const { t } = useTranslation();
	const snap = useSnapshot(store);
	return (
		<div className="tk-chips">
			{FILTERS.map(({ key, labelKey, Icon }) => (
				<button
					type="button"
					key={key}
					className="tk-chip"
					data-on={snap[key]}
					aria-pressed={snap[key]}
					onClick={() => {
						store[key] = !store[key];
					}}
				>
					<Icon size={13} strokeWidth={1.9} />
					{t(labelKey)}
				</button>
			))}
		</div>
	);
};

export const FilterSearch = ({ style }: { style?: CSSProperties }) => {
	const { t } = useTranslation();
	const snap = useSnapshot(store);
	const dataSnap = useSnapshot(dataStore);
	const inputRef = useRef<HTMLInputElement>(null);

	// Re-renders at midnight, so the month chips follow the calendar instead of
	// pinning whatever month the page happened to load in.
	const today = useCalendarDay();
	const thisMonth = dayjs(today).month() + 1;
	const nextMonth = (thisMonth % 12) + 1;

	// A month facet picked before midnight is already dead: it filters nothing
	// and must not count as "filtered" either.
	const monthFacetOn = isMonthFacetActive();

	// Note the `!` on all three kind toggles: the list is filtered when a kind
	// is HIDDEN, not when it is shown. Weddings default to hidden, so without
	// `!showWeddings` the "N of 33 shown" notice never appeared at all, leaving
	// "27 Birthdays" unexplained against a "People tracked 33" hero.
	const isFiltered =
		Boolean(snap.search) ||
		!snap.showBoys ||
		!snap.showGirls ||
		!snap.showWeddings ||
		monthFacetOn ||
		snap.facets.generation !== null ||
		snap.facets.ageGroup !== null;

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "/" && document.activeElement !== inputRef.current) {
				if (
					e.target instanceof HTMLInputElement ||
					e.target instanceof HTMLTextAreaElement
				) {
					return;
				}
				e.preventDefault();
				inputRef.current?.focus();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	// Each chip writes a facet field; none of them touch the free-text query.
	const shortcuts = [
		{
			key: "this_month",
			label: t("app.filters.shortcuts.this_month"),
			on: monthFacetOn && snap.facets.month === thisMonth,
			toggle: () => toggleMonthFacet(thisMonth),
		},
		{
			key: "next_month",
			label: t("app.filters.shortcuts.next_month"),
			on: monthFacetOn && snap.facets.month === nextMonth,
			toggle: () => toggleMonthFacet(nextMonth),
		},
		{
			key: "gen_z",
			label: t("app.filters.shortcuts.gen_z"),
			on: snap.facets.generation === "gen_z",
			toggle: () => toggleGenerationFacet("gen_z"),
		},
		{
			key: "teens",
			label: t("app.filters.shortcuts.teens"),
			on: snap.facets.ageGroup === "teens",
			toggle: () => toggleAgeGroupFacet("teens"),
		},
		{
			key: "seniors",
			label: t("app.filters.shortcuts.seniors"),
			on: snap.facets.ageGroup === "seniors",
			toggle: () => toggleAgeGroupFacet("seniors"),
		},
	];

	const handleReset = () => {
		store.search = "";
		store.showBoys = true;
		store.showGirls = true;
		store.showWeddings = false;
		clearFacets();
	};

	return (
		<div style={style}>
			<div className="tk-search">
				<Search size={15} strokeWidth={1.9} />
				<input
					ref={inputRef}
					type="search"
					value={snap.search}
					placeholder={t("app.search")}
					aria-label={t("app.search")}
					onChange={(e) => {
						store.search = e.target.value;
					}}
				/>
				{snap.search ? (
					<button
						type="button"
						className="tk-search__clear"
						aria-label="Clear search"
						onClick={() => {
							store.search = "";
							inputRef.current?.focus();
						}}
					>
						<X size={14} strokeWidth={2} />
					</button>
				) : (
					<kbd>/</kbd>
				)}
			</div>

			<div className="tk-search__foot">
				<div className="tk-chips">
					{shortcuts.map((s) => (
						<button
							type="button"
							key={s.key}
							className="tk-chip"
							data-on={s.on}
							aria-pressed={s.on}
							onClick={s.toggle}
						>
							{s.label}
						</button>
					))}
				</div>
				{isFiltered && (
					<div className="tk-notice">
						<span>
							{t("app.list.showing", {
								shown: dataSnap.filtered.length,
								total: birthdays.length,
							})}
						</span>
						<button
							type="button"
							className="tk-chip tk-chip--ghost"
							onClick={handleReset}
						>
							<RotateCcw size={12} strokeWidth={2} />
							{t("app.list.reset")}
						</button>
					</div>
				)}
			</div>
		</div>
	);
};
