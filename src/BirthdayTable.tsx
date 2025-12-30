import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { type Birthday, getAgeEmoji, getKindColor } from "./birthdays";

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

export const BirthdayTable = ({ data }: { data: readonly Birthday[] }) => {
	const dataSource = data.map((x, i) => ({ ...x, key: i }));

	return (
		<Table
			columns={columns}
			dataSource={dataSource}
			pagination={false}
			size="small"
			scroll={{ y: 500 }}
		/>
	);
};
