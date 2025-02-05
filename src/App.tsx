import { Card, Input, Layout, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { type Birthday, birthdays } from "./birthdays";

const sorter = (a: Birthday, b: Birthday) =>
	a.birthday.getTime() - b.birthday.getTime();
const columns: ColumnsType<Birthday> = [
	{
		title: "Name",
		dataIndex: "name",
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
		sorter,
	},
	{
		title: "Sign",
		dataIndex: "sign",
		sorter,
	},
	{
		title: "Birthgem",
		dataIndex: "birthgem",
		sorter,
	},
];

export const App = () => {
	const [search, setSearch] = useState("");
	const filteredBirthdays = useMemo(
		() =>
			birthdays.filter((x) => JSON.stringify(x).toLowerCase().includes(search)),
		[search],
	);
	const data = useMemo(
		() => filteredBirthdays.map((x, i) => ({ key: i, ...x })),
		[filteredBirthdays],
	);
	return (
		<Layout>
			<Layout.Header />
			<Layout.Content>
				<Card title="Birthdays">
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
						style={{ overflow: "auto" }}
					/>
				</Card>
			</Layout.Content>
			<Layout.Footer>Charles ©2023</Layout.Footer>
		</Layout>
	);
};
