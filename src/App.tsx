import { Column, type Datum, Pie } from "@ant-design/charts";
import {
	Button,
	Card,
	Col,
	Input,
	Layout,
	Row,
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
	monthNames,
} from "./birthdays";

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

const tooltip = {
	title: (d: Datum) => d.type,
	items: [
		{ field: "value", channel: "y" },
		{
			field: "names",
			channel: "color",
			valueFormatter: (v: string[]) => v.join(", "),
		},
	],
};

const StatColumn = <T extends Datum>({
	title,
	data,
}: {
	title: string;
	data: T[];
}) => (
	<Col xs={24} sm={12} md={8}>
		<Typography.Title level={5}>{title}</Typography.Title>
		<Column
			data={data}
			xField="type"
			yField="value"
			height={200}
			axis={{ y: { grid: false } }}
			label={{ text: "value" }}
			tooltip={tooltip}
		/>
	</Col>
);

const StatPie = <T extends Datum>({
	title,
	data,
}: {
	title: string;
	data: T[];
}) => (
	<Col xs={24} sm={12} md={8}>
		<Typography.Title level={5}>{title}</Typography.Title>
		<Pie
			data={data}
			angleField="value"
			colorField="type"
			height={200}
			legend={false}
			label={{ text: "type" }}
			tooltip={tooltip}
		/>
	</Col>
);

const getDistribution = (
	data: Birthday[],
	getValue: (b: Birthday) => string | undefined,
): Datum[] => {
	const counts: Record<string, string[]> = {};
	for (const x of data) {
		const val = getValue(x);
		if (val) {
			if (!counts[val]) counts[val] = [];
			counts[val]?.push(x.name);
		}
	}
	return Object.entries(counts)
		.map(([type, names]) => ({ type, value: names.length, names }))
		.sort((a, b) => b.value - a.value);
};

const Statistics = () => {
	const data = useMemo(
		() => birthdays.filter((x) => !x.isWedding && x.kind !== "💒"),
		[],
	);

	const stats = useMemo(() => {
		return {
			letters: getDistribution(data, (x) => (x.name[0] || "?").toUpperCase()),
			signs: getDistribution(data, (x) => x.sign),
			months: getDistribution(data, (x) => monthNames[x.month - 1]),
			ageGroups: getDistribution(data, (x) => x.ageGroup),
			days: getDistribution(data, (x) => x.dayOfWeek),
			decades: getDistribution(data, (x) => x.decade),
			generations: getDistribution(data, (x) => x.generation),
			seasons: getDistribution(data, (x) => x.season),
			kinds: getDistribution(data, (x) => x.kind),
			elements: getDistribution(data, (x) => x.element),
			birthgems: getDistribution(data, (x) => x.birthgem),
			chineseZodiac: getDistribution(data, (x) => x.chineseZodiac),
		};
	}, [data]);

	return (
		<Card
			title="Statistics (Excluding Weddings)"
			size="small"
			style={{ marginTop: 16 }}
		>
			<style>
				{`
				.g2-tooltip-list-item-value {
					max-width: unset !important;
					white-space: pre-wrap !important;
				}
				`}
			</style>
			<Row gutter={[16, 16]}>
				<StatColumn title="By First Letter" data={stats.letters} />
				<StatPie title="By Gender" data={stats.kinds} />
				<StatPie title="By Sign" data={stats.signs} />
				<StatPie title="By Element" data={stats.elements} />
				<StatColumn title="By Month" data={stats.months} />
				<StatColumn title="By Birthgem" data={stats.birthgems} />
				<StatPie title="By Age Group" data={stats.ageGroups} />
				<StatColumn title="By Day" data={stats.days} />
				<StatColumn title="By Decade" data={stats.decades} />
				<StatPie title="By Generation" data={stats.generations} />
				<StatPie title="By Season" data={stats.seasons} />
				<StatColumn title="By Chinese Zodiac" data={stats.chineseZodiac} />
			</Row>
		</Card>
	);
};

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
