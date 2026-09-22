import { Button, Input, type InputRef, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { type CSSProperties, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { birthdays, monthNames } from "./birthdays";
import { dataStore, store } from "./store";

export const FilterButtons = () => {
	const { t } = useTranslation();
	const snap = useSnapshot(store);
	const configs = [
		{ key: "showBoys", label: t("app.filters.boys"), icon: "♂️" },
		{ key: "showGirls", label: t("app.filters.girls"), icon: "♀️" },
		{ key: "showWeddings", label: t("app.filters.weddings"), icon: "💒" },
	] as const;
	return (
		<Space wrap>
			{configs.map((c) => (
				<Button
					key={c.key}
					size="small"
					type={snap[c.key] ? "primary" : "default"}
					onClick={() => {
						store[c.key] = !store[c.key];
					}}
				>
					{c.label} {c.icon}
				</Button>
			))}
		</Space>
	);
};

export const FilterSearch = ({ style }: { style?: CSSProperties }) => {
	const { t } = useTranslation();
	const snap = useSnapshot(store);
	const dataSnap = useSnapshot(dataStore);
	const inputRef = useRef<InputRef>(null);

	const isFiltered =
		Boolean(snap.search) ||
		!snap.showBoys ||
		!snap.showGirls ||
		snap.showWeddings;

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "/" && document.activeElement !== inputRef.current?.input) {
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
		<Space direction="vertical" style={{ width: "100%" }} size="small">
			<Input.Search
				ref={inputRef}
				placeholder={`${t("app.search")} (Press /)`}
				allowClear
				style={style}
				onChange={(e) => {
					store.search = e.target.value;
				}}
				value={snap.search}
			/>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					flexWrap: "wrap",
					gap: 8,
				}}
			>
				<Space wrap size="small">
					{shortcuts.map((s) => (
						<Tag.CheckableTag
							key={s.label}
							checked={snap.search.toLowerCase() === s.query?.toLowerCase()}
							onChange={(checked) => {
								store.search = checked ? s.query || "" : "";
							}}
							style={{ cursor: "pointer" }}
						>
							{s.label}
						</Tag.CheckableTag>
					))}
				</Space>
				{isFiltered && (
					<Space size="small">
						<Typography.Text type="secondary" style={{ fontSize: "0.8rem" }}>
							Showing {dataSnap.filtered.length} of {birthdays.length}
						</Typography.Text>
						<Button
							size="small"
							type="link"
							onClick={handleReset}
							style={{ padding: 0 }}
						>
							Reset
						</Button>
					</Space>
				)}
			</div>
		</Space>
	);
};
