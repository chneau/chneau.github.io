import { Column, type Datum, Pie } from "@ant-design/charts";
import { Card, Col, Row, Typography } from "antd";
import { useMemo } from "react";
import { type Birthday, birthdays, monthNames } from "./birthdays";

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

export const Statistics = () => {
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
