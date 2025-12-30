import {
	Bar,
	Column,
	ConfigProvider,
	type Datum,
	Pie,
} from "@ant-design/charts";
import { Card, Col, Row, Typography } from "antd";
import { useMemo } from "react";
import { useSnapshot } from "valtio";
import { type Birthday, monthNames } from "./birthdays";
import { dataStore, store } from "./store";

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
			height={250}
			legend={{ layout: "horizontal", position: "bottom" }}
			label={{ text: "value", position: "outside" }}
			tooltip={tooltip}
		/>
	</Col>
);

const AgePyramid = ({ data }: { data: readonly Birthday[] }) => {
	const pyramidData = useMemo(() => {
		const groups = [
			"0-9",
			"10-19",
			"20-29",
			"30-39",
			"40-49",
			"50-59",
			"60-69",
			"70-79",
			"80-89",
			"90+",
		];
		const result: Datum[] = [];

		groups.forEach((group) => {
			const range = group === "90+" ? [90, 200] : group.split("-").map(Number);
			const range0 = range[0] as number;
			const range1 = range[1] as number;
			const boys = data.filter(
				(b) => b.kind === "♂️" && b.age >= range0 && b.age <= range1,
			);
			const girls = data.filter(
				(b) => b.kind === "♀️" && b.age >= range0 && b.age <= range1,
			);

			result.push({
				group,
				gender: "♂️",
				value: -boys.length,
				names: boys.map((b) => b.name),
			});
			result.push({
				group,
				gender: "♀️",
				value: girls.length,
				names: girls.map((b) => b.name),
			});
		});

		return result;
	}, [data]);

	return (
		<Col xs={24} md={12}>
			<Typography.Title level={5}>Age & Gender Distribution</Typography.Title>
			<Bar
				data={pyramidData}
				xField="group"
				yField="value"
				seriesField="gender"
				stack={true}
				height={300}
				coordinate={{ transform: [{ type: "transpose" }] }}
				axis={{
					y: {
						labelFormatter: (v: number) => Math.abs(v),
					},
				}}
				tooltip={{
					title: (d) => d.group,
					items: [
						{
							channel: "y",
							valueFormatter: (v: number) => Math.abs(v),
						},
						{
							field: "names",
							valueFormatter: (v: string[]) => v.join(", "),
						},
					],
				}}
			/>
		</Col>
	);
};

const getDistribution = (
	data: readonly Birthday[],
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

export const Statistics = () => {
	const dataSnap = useSnapshot(dataStore);
	const storeSnap = useSnapshot(store);
	const data = dataSnap.filtered;

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
		<ConfigProvider common={{ theme: storeSnap.darkMode ? "dark" : "light" }}>
			<Card title="Statistics" size="small" style={{ marginTop: 16 }}>
				<style>
					{`
				.g2-tooltip-list-item-value {
					max-width: unset !important;
					white-space: pre-wrap !important;
				}
				`}
				</style>
				<Row gutter={[16, 16]}>
					<StatPie title="Zodiac Signs" data={stats.signs} />
					<StatPie title="Chinese Zodiac" data={stats.chineseZodiac} />
					<StatPie title="Astrological Elements" data={stats.elements} />
					<StatPie title="Gender Distribution" data={stats.kinds} />
					<StatPie title="Age Groups" data={stats.ageGroups} />
					<StatPie title="Generations" data={stats.generations} />
					<StatPie title="Birth Seasons" data={stats.seasons} />
					<StatColumn title="Name First Letter" data={stats.letters} />
					<StatColumn title="Birth Month" data={stats.months} />
					<StatColumn title="Birthstones" data={stats.birthgems} />
					<StatColumn title="Birth Day of Week" data={stats.days} />
					<StatColumn title="Birth Decades" data={stats.decades} />
					<AgePyramid data={data} />
				</Row>
			</Card>
		</ConfigProvider>
	);
};
