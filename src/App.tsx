import { Card, Layout, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { useSnapshot } from "valtio";
import { type Birthday, getAgeEmoji, getKindColor } from "./birthdays";
import { FilterButtons, FilterSearch } from "./Filter";
import { Statistics } from "./Statistics";
import { dataStore } from "./store";

const columns: ColumnsType<Birthday> = [
	{
		title: "Name",
		dataIndex: "name",
		render: (_, x) => {
			return (
				<Tag color={getKindColor(x.kind)}>
					{x.name} {x.kind}
				</Tag>
			);
		},
		sorter: (a, b) => a.name.localeCompare(b.name),
	},
	{
		title: "Birthday",
		dataIndex: "birthdayString",
		render: (_, x) => x.birthdayString,
		sorter: (a, b) => a.birthday.getTime() - b.birthday.getTime(),
	},
	{
		title: "Age",
		dataIndex: "age",
		render: (age, x) => `${age} ${getAgeEmoji(age, x.kind)}`,
		sorter: (a, b) => a.age - b.age,
	},
	{
		title: "Sign",
		dataIndex: "sign",
		render: (_, x) => (
			<Tag>
				{x.signSymbol} {x.sign}
			</Tag>
		),
		sorter: (a, b) => a.sign.localeCompare(b.sign),
	},
	{
		title: "Birthgem",
		dataIndex: "birthgem",
		render: (_, x) => (
			<Tag color="blue">{`${x.birthgem} (${x.monthString})`}</Tag>
		),
		sorter: (a, b) => a.birthgem.localeCompare(b.birthgem),
		responsive: ["md"],
	},
	{
		title: "Chinese",
		dataIndex: "chineseZodiac",
		render: (_, x) => <Tag>{x.chineseZodiac}</Tag>,
		sorter: (a, b) => a.chineseZodiac.localeCompare(b.chineseZodiac),
		responsive: ["lg"],
	},
];

export const App = () => {
	const dataSnap = useSnapshot(dataStore);

	const data = useMemo(
		() => dataSnap.filtered.slice(0, 20).map((x, i) => ({ key: i, ...x })),
		[dataSnap.filtered],
	);
	return (
		<Layout style={{ minHeight: "100vh" }}>
			<Layout.Header style={{ display: "flex", alignItems: "center" }}>
				<Typography.Title level={3} style={{ color: "white", margin: 0 }}>
					Birthday Tracker
				</Typography.Title>
			</Layout.Header>
			<Layout.Content style={{ padding: 16 }}>
				<Card title="Birthdays" size="small" extra={<FilterButtons />}>
					<FilterSearch />
					<Table
						columns={columns}
						dataSource={data}
						pagination={false}
						size="small"
						scroll={{ y: 500 }}
					/>
				</Card>
				<Statistics />
			</Layout.Content>
			<Layout.Footer style={{ textAlign: "center" }}>
				Birthday Tracker ©{new Date().getFullYear()}
			</Layout.Footer>
		</Layout>
	);
};
