import dayjs from "dayjs";
import { Gem, Mars, RotateCcw, Search, Venus, X } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { birthdays, monthNames } from "./birthdays";
import { dataStore, store } from "./store";

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

	const isFiltered =
		Boolean(snap.search) ||
		!snap.showBoys ||
		!snap.showGirls ||
		snap.showWeddings;

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

	const shortcuts = [
		{
			label: t("app.filters.shortcuts.this_month"),
			query: monthNames[dayjs().month()],
		},
		{
			label: t("app.filters.shortcuts.next_month"),
			query: monthNames[(dayjs().month() + 1) % 12],
		},
		{ label: t("app.filters.shortcuts.gen_z"), query: "gen_z" },
		{ label: t("app.filters.shortcuts.teens"), query: "teens" },
		{ label: t("app.filters.shortcuts.seniors"), query: "seniors" },
	];

	const handleReset = () => {
		store.search = "";
		store.showBoys = true;
		store.showGirls = true;
		store.showWeddings = false;
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
					{shortcuts.map((s) => {
						const on =
							s.query !== undefined &&
							snap.search.toLowerCase() === s.query.toLowerCase();
						return (
							<button
								type="button"
								key={s.label}
								className="tk-chip"
								data-on={on}
								onClick={() => {
									store.search = on ? "" : s.query || "";
								}}
							>
								{s.label}
							</button>
						);
					})}
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
