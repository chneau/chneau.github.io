import { Card, Input, Layout, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { type Birthday, birthdays } from "./birthdays";

const sorter = (a: Birthday, b: Birthday) =>
	a.birthday.getTime() - b.birthday.getTime();
const columns: ColumnsType<Birthday> = [
	{
		title: "Name",
		dataIndex: "name",
		render: (_, x) =>
			x.isWedding ? (
				<Tag color="gold">
					{x.name} {x.kind}
				</Tag>
			) : (
				<>
					{x.name} {x.kind}
				</>
			),
		sorter: (a, b) => a.name.localeCompare(b.name),
	},
	{
		title: "Birthday",
		dataIndex: "birthdayString",
		render: (_, x) => x.birthdayString,
		sorter,
	},
	{
		title: "Age",
		dataIndex: "age",
		sorter: (a, b) => a.age - b.age,
	},
	{
		title: "Sign",
		dataIndex: "sign",
		render: (_, x) => <Tag>{`${x.signSymbol} ${x.sign}`}</Tag>,
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
];

export const App = () => {
	const [search, setSearch] = useState("");
	const filteredBirthdays = useMemo(
		() =>
			birthdays.filter(
				(x) =>
					x.name.toLowerCase().includes(search) ||
					x.sign.toLowerCase().includes(search) ||
					x.birthgem.toLowerCase().includes(search),
			),
		[search],
	);
	const data = useMemo(
		() => filteredBirthdays.map((x, i) => ({ key: i, ...x })),
		[filteredBirthdays],
	);
	return (
		<Layout style={{ minHeight: "100vh" }}>
			<Layout.Header style={{ display: "flex", alignItems: "center" }}>
				<Typography.Title level={3} style={{ color: "white", margin: 0 }}>
					Birthday Tracker
				</Typography.Title>
			</Layout.Header>
			<Layout.Content>
				<Card title="Birthdays" size="small">
					<Input.Search
						placeholder="Search..."
						style={{ marginBottom: 8 }}
						onChange={(e) => setSearch(e.target.value.toLowerCase())}
						value={search}
					/>
					<Table
						columns={columns}
						dataSource={data}
						pagination={false}
						size="small"
					/>
				</Card>
			</Layout.Content>
			<Layout.Footer style={{ textAlign: "center" }}>
				Birthday Tracker ©{new Date().getFullYear()}
			</Layout.Footer>
		</Layout>
	);
};
