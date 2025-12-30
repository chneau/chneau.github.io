import { Column, Pie } from "@ant-design/charts";
import {
	Card,
	Checkbox,
	Col,
	Input,
	Layout,
	Row,
	Table,
	Tag,
	Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { type Birthday, birthdays } from "./birthdays";

const sorter = (a: Birthday, b: Birthday) =>
	a.birthday.getTime() - b.birthday.getTime();
const columns: ColumnsType<Birthday> = [
	{
		title: "Name",
		dataIndex: "name",
		render: (_, x) => {
			let color: string | undefined;
			if (x.kind === "💒") color = "gold";
			if (x.kind === "♂️") color = "blue";
			if (x.kind === "♀️") color = "magenta";
			return (
				<Tag color={color}>
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
		sorter,
	},
	{
		title: "Age",
		dataIndex: "age",
		render: (age, x) => {
			let emoji = "🧑";
			if (x.kind === "💒") emoji = "💍";
			else if (age < 3) emoji = "👶";
			else if (age < 13) emoji = "🧒";
			else if (age >= 60) emoji = "🧓";
			return `${age} ${emoji}`;
		},
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

const Statistics = () => {
	const data = useMemo(
		() => birthdays.filter((x) => !x.isWedding && x.kind !== "💒"),
		[],
	);

	const letters = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const x of data) {
			const l = (x.name[0] || "?").toUpperCase();
			counts[l] = (counts[l] || 0) + 1;
		}
		return Object.entries(counts)
			.map(([type, value]) => ({ type, value }))
			.sort((a, b) => b.value - a.value);
	}, [data]);

	const signs = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const x of data) {
			counts[x.sign] = (counts[x.sign] || 0) + 1;
		}
		return Object.entries(counts)
			.map(([type, value]) => ({ type, value }))
			.sort((a, b) => b.value - a.value);
	}, [data]);

	const months = useMemo(() => {
		const counts: Record<string, number> = {};
		const monthNames = [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		];
		for (const x of data) {
			const m = monthNames[x.month - 1];
			if (m) {
				counts[m] = (counts[m] || 0) + 1;
			}
		}
		return monthNames
			.map((m) => ({ type: m, value: counts[m] || 0 }))
			.filter((x) => x.value > 0)
			.sort((a, b) => b.value - a.value);
	}, [data]);

	const ageGroups = useMemo(() => {
		const counts = {
			"Babies 👶 (<3)": 0,
			"Children 🧒 (<13)": 0,
			"Adults 🧑 (<60)": 0,
			"Seniors 🧓 (60+)": 0,
		};
		for (const x of data) {
			if (x.age < 3) counts["Babies 👶 (<3)"]++;
			else if (x.age < 13) counts["Children 🧒 (<13)"]++;
			else if (x.age < 60) counts["Adults 🧑 (<60)"]++;
			else counts["Seniors 🧓 (60+)"]++;
		}
		return Object.entries(counts)
			.map(([type, value]) => ({ type, value }))
			.filter((x) => x.value > 0)
			.sort((a, b) => b.value - a.value);
	}, [data]);

	const days = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const x of data) {
			counts[x.dayOfWeek] = (counts[x.dayOfWeek] || 0) + 1;
		}
		return Object.entries(counts)
			.map(([type, value]) => ({ type, value }))
			.sort((a, b) => b.value - a.value);
	}, [data]);

	const decades = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const x of data) {
			const d = Math.floor(x.year / 10) * 10;
			const label = `${d}s`;
			counts[label] = (counts[label] || 0) + 1;
		}
		return Object.entries(counts)
			.map(([type, value]) => ({ type, value }))
			.sort((a, b) => b.value - a.value);
	}, [data]);

	const generations = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const x of data) {
			counts[x.generation] = (counts[x.generation] || 0) + 1;
		}
		return Object.entries(counts)
			.map(([type, value]) => ({ type, value }))
			.sort((a, b) => b.value - a.value);
	}, [data]);

	const seasons = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const x of data) {
			counts[x.season] = (counts[x.season] || 0) + 1;
		}
		return Object.entries(counts)
			.map(([type, value]) => ({ type, value }))
			.sort((a, b) => b.value - a.value);
	}, [data]);

	const chineseZodiac = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const x of data) {
			counts[x.chineseZodiac] = (counts[x.chineseZodiac] || 0) + 1;
		}
		return Object.entries(counts)
			.map(([type, value]) => ({ type, value }))
			.sort((a, b) => b.value - a.value);
	}, [data]);

	return (
		<Card
			title="Statistics (Excluding Weddings)"
			size="small"
			style={{ marginTop: 16 }}
		>
			<Row gutter={[16, 16]}>
				<Col xs={24} sm={12} md={8}>
					<Typography.Title level={5}>By First Letter</Typography.Title>
					<Column
						data={letters}
						xField="type"
						yField="value"
						height={200}
						axis={{ y: { grid: false } }}
						label={{ text: "value" }}
					/>
				</Col>
				<Col xs={24} sm={12} md={8}>
					<Typography.Title level={5}>By Sign</Typography.Title>
					<Pie
						data={signs}
						angleField="value"
						colorField="type"
						height={200}
						legend={false}
						label={{ text: "type" }}
					/>
				</Col>
				<Col xs={24} sm={12} md={8}>
					<Typography.Title level={5}>By Month</Typography.Title>
					<Column
						data={months}
						xField="type"
						yField="value"
						height={200}
						axis={{ y: { grid: false } }}
						label={{ text: "value" }}
					/>
				</Col>
				<Col xs={24} sm={12} md={8}>
					<Typography.Title level={5}>By Age Group</Typography.Title>
					<Pie
						data={ageGroups}
						angleField="value"
						colorField="type"
						height={200}
						legend={false}
						label={{ text: "type" }}
					/>
				</Col>
				<Col xs={24} sm={12} md={8}>
					<Typography.Title level={5}>By Day</Typography.Title>
					<Column
						data={days}
						xField="type"
						yField="value"
						height={200}
						axis={{ y: { grid: false } }}
						label={{ text: "value" }}
					/>
				</Col>
				<Col xs={24} sm={12} md={8}>
					<Typography.Title level={5}>By Decade</Typography.Title>
					<Column
						data={decades}
						xField="type"
						yField="value"
						height={200}
						axis={{ y: { grid: false } }}
						label={{ text: "value" }}
					/>
				</Col>
				<Col xs={24} sm={12} md={8}>
					<Typography.Title level={5}>By Generation</Typography.Title>
					<Pie
						data={generations}
						angleField="value"
						colorField="type"
						height={200}
						legend={false}
						label={{ text: "type" }}
					/>
				</Col>
				<Col xs={24} sm={12} md={8}>
					<Typography.Title level={5}>By Season</Typography.Title>
					<Pie
						data={seasons}
						angleField="value"
						colorField="type"
						height={200}
						legend={false}
						label={{ text: "type" }}
					/>
				</Col>
				<Col xs={24} sm={12} md={8}>
					<Typography.Title level={5}>By Chinese Zodiac</Typography.Title>
					<Column
						data={chineseZodiac}
						xField="type"
						yField="value"
						height={200}
						axis={{ y: { grid: false } }}
						label={{ text: "value" }}
					/>
				</Col>
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
				<Card title="Birthdays" size="small">
					<div style={{ marginBottom: 8 }}>
						<Checkbox
							checked={showBoys}
							onChange={(e) => setShowBoys(e.target.checked)}
						>
							Boys ♂️
						</Checkbox>
						<Checkbox
							checked={showGirls}
							onChange={(e) => setShowGirls(e.target.checked)}
						>
							Girls ♀️
						</Checkbox>
						<Checkbox
							checked={showWeddings}
							onChange={(e) => setShowWeddings(e.target.checked)}
						>
							Weddings 💒
						</Checkbox>
					</div>
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
				<Statistics />
			</Layout.Content>
			<Layout.Footer style={{ textAlign: "center" }}>
				Birthday Tracker ©{new Date().getFullYear()}
			</Layout.Footer>
		</Layout>
	);
};
