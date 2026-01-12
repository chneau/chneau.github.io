import { Button, Input, Space, Tag } from "antd";
import dayjs from "dayjs";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { monthNames } from "./birthdays";
import { store } from "./store";

export const FilterButtons = () => {
	const { t } = useTranslation();
	const snap = useSnapshot(store);
	return (
		<Space wrap>
			<Button
				size="small"
				type={snap.showBoys ? "primary" : "default"}
				onClick={() => {
					store.showBoys = !store.showBoys;
				}}
			>
				{t("app.filters.boys")} ♂️
			</Button>
			<Button
				size="small"
				type={snap.showGirls ? "primary" : "default"}
				onClick={() => {
					store.showGirls = !store.showGirls;
				}}
			>
				{t("app.filters.girls")} ♀️
			</Button>
			<Button
				size="small"
				type={snap.showWeddings ? "primary" : "default"}
				onClick={() => {
					store.showWeddings = !store.showWeddings;
				}}
			>
				{t("app.filters.weddings")} 💒
			</Button>
		</Space>
	);
};

export const FilterSearch = ({ style }: { style?: CSSProperties }) => {
	const { t } = useTranslation();
	const snap = useSnapshot(store);

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

	return (
		<Space orientation="vertical" style={{ width: "100%" }}>
			<Input.Search
				placeholder={t("app.search")}
				allowClear
				style={style}
				onChange={(e) => {
					store.search = e.target.value;
				}}
				value={snap.search}
			/>
			<Space wrap style={{ marginTop: -8 }}>
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
		</Space>
	);
};
