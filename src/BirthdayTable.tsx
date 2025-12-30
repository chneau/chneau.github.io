import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useSnapshot } from "valtio";
import { type Birthday, getAgeEmoji, getKindColor } from "./birthdays";
import { store } from "./store";

const Highlight = ({ text, search }: { text: string; search: string }) => {
	if (!search.trim()) return <>{text}</>;
	const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = text.split(new RegExp(`(${escapedSearch})`, "gi"));
	return (
		<>
			{parts.map((part, i) =>
				part.toLowerCase() === search.toLowerCase() ? (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: fine for static text parts
						key={i}
						style={{ backgroundColor: "#ffe58f", padding: 0, color: "black" }}
					>
						{part}
					</span>
				) : (
					part
				),
			)}
		</>
	);
};

export const BirthdayTable = ({ data }: { data: readonly Birthday[] }) => {
	const dataSource = data.map((x, i) => ({ ...x, key: i }));
	const { search } = useSnapshot(store);

	const columns: ColumnsType<Birthday> = [
		{
			title: "Name",
			dataIndex: "name",
			render: (_, x) => {
				return (
					<Tag color={getKindColor(x.kind)}>
						<Highlight text={x.name} search={search} /> {x.kind}
					</Tag>
				);
			},
			sorter: (a, b) => a.name.localeCompare(b.name),
		},
		{
			title: "Birthday",
			dataIndex: "birthdayString",
			render: (_, x) => <Highlight text={x.birthdayString} search={search} />,
			sorter: (a, b) => a.birthday.getTime() - b.birthday.getTime(),
		},
		{
			title: "Age",
			dataIndex: "age",
			render: (age, x) => (
				<Highlight
					text={`${age} ${getAgeEmoji(age, x.kind)}`}
					search={search}
				/>
			),
			sorter: (a, b) => a.age - b.age,
		},
		{
			title: "Sign",
			dataIndex: "sign",
			render: (_, x) => (
				<Tag>
					{x.signSymbol} <Highlight text={x.sign} search={search} />
				</Tag>
			),
			sorter: (a, b) => a.sign.localeCompare(b.sign),
		},
		{
			title: "Birthgem",
			dataIndex: "birthgem",
			render: (_, x) => (
				<Tag color="blue">
					<Highlight
						text={`${x.birthgem} (${x.monthString})`}
						search={search}
					/>
				</Tag>
			),
			sorter: (a, b) => a.birthgem.localeCompare(b.birthgem),
			responsive: ["md"],
		},
		{
			title: "Chinese",
			dataIndex: "chineseZodiac",
			render: (_, x) => (
				<Tag>
					<Highlight text={x.chineseZodiac} search={search} />
				</Tag>
			),
			sorter: (a, b) => a.chineseZodiac.localeCompare(b.chineseZodiac),
			responsive: ["lg"],
		},
	];

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
