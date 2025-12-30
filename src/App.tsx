import {
	Button,
	Card,
	Input,
	Layout,
	Space,
	Table,
	Tag,
	Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import {
	type Birthday,
	birthdays,
	getAgeEmoji,
	getKindColor,
} from "./birthdays";
import { Statistics } from "./Statistics";

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
	const [search, setSearch] = useState("");
	const [showBoys, setShowBoys] = useState(true);
	const [showGirls, setShowGirls] = useState(true);
	const [showWeddings, setShowWeddings] = useState(false);

	const filteredBirthdays = useMemo(
		() =>
			birthdays.filter((x) => {
				const matchesSearch =
					x.name.toLowerCase().includes(search) ||
					x.sign.toLowerCase().includes(search) ||
					x.birthgem.toLowerCase().includes(search);

				if (!matchesSearch) return false;

				if (x.kind === "♂️" && !showBoys) return false;
				if (x.kind === "♀️" && !showGirls) return false;
				if (x.kind === "💒" && !showWeddings) return false;

				return true;
			}),
		[search, showBoys, showGirls, showWeddings],
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
			<Layout.Content style={{ padding: 16 }}>
				<Card
					title="Birthdays"
					size="small"
					extra={
						<Space>
							<Button
								size="small"
								type={showBoys ? "primary" : "default"}
								onClick={() => setShowBoys(!showBoys)}
							>
								Boys ♂️
							</Button>
							<Button
								size="small"
								type={showGirls ? "primary" : "default"}
								onClick={() => setShowGirls(!showGirls)}
							>
								Girls ♀️
							</Button>
							<Button
								size="small"
								type={showWeddings ? "primary" : "default"}
								onClick={() => setShowWeddings(!showWeddings)}
							>
								Weddings 💒
							</Button>
						</Space>
					}
				>
					<Input.Search
						placeholder="Search..."
						allowClear
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
				<Statistics />
			</Layout.Content>
			<Layout.Footer style={{ textAlign: "center" }}>
				Birthday Tracker ©{new Date().getFullYear()}
			</Layout.Footer>
		</Layout>
	);
};
