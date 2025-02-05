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
		sorter: (a, b) => a.age - b.age,
	},
	{
		title: "Sign",
		dataIndex: "sign",
		render: (_, x) => `${x.signSymbol}${x.sign}`,
		sorter: (a, b) => a.sign.localeCompare(b.sign),
	},
	{
		title: "Birthgem",
		dataIndex: "birthgem",
		render: (_, x) => `${x.birthgem} (${x.monthString})`,
		sorter: (a, b) => a.birthgem.localeCompare(b.birthgem),
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
						style={{ overflow: "auto" }}
					/>
				</Card>
			</Layout.Content>
		</Layout>
	);
};
