import { Button, Input, Space, Tag } from "antd";
import type { CSSProperties } from "react";
import { useSnapshot } from "valtio";
import { monthNames } from "./birthdays";
import { store } from "./store";

const SHORTCUTS = [
	{ label: "This Month", query: monthNames[new Date().getMonth()] },
	{
		label: "Next Month",
		query: monthNames[(new Date().getMonth() + 1) % 12],
	},
	{ label: "Gen Z", query: "Gen Z" },
	{ label: "Teens", query: "Teens" },
	{ label: "Seniors", query: "Seniors" },
];

export const FilterButtons = () => {
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
				Boys ♂️
			</Button>
			<Button
				size="small"
				type={snap.showGirls ? "primary" : "default"}
				onClick={() => {
					store.showGirls = !store.showGirls;
				}}
			>
				Girls ♀️
			</Button>
			<Button
				size="small"
				type={snap.showWeddings ? "primary" : "default"}
				onClick={() => {
					store.showWeddings = !store.showWeddings;
				}}
			>
				Weddings 💒
			</Button>
		</Space>
	);
};

export const FilterSearch = ({ style }: { style?: CSSProperties }) => {
	const snap = useSnapshot(store);
	return (
		<Space orientation="vertical" style={{ width: "100%" }}>
			<Input.Search
				placeholder="Search..."
				allowClear
				style={style}
				onChange={(e) => {
					store.search = e.target.value;
				}}
				value={snap.search}
			/>
			<Space wrap style={{ marginTop: -8 }}>
				{SHORTCUTS.map((s) => (
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
