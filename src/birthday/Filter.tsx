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
