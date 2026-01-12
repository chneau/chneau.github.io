import {
	Area,
	Bar,
	Column,
	type Datum,
	Heatmap,
	Pie,
} from "@ant-design/charts";
import { Card, Col, Row, Typography } from "antd";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { type Birthday, monthNames } from "./birthdays";
import { dataStore, store } from "./store";

const AgeDistribution = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
	const distributionData = useMemo(() => {
		const ages = data.map((b) => b.age);
		if (ages.length === 0) return [];
		const minAge = Math.min(...ages);
		const maxAge = Math.max(...ages);
		const result = [];
		for (let i = minAge; i <= maxAge; i++) {
			const count = data.filter((b) => b.age === i);
			result.push({
				age: i.toString(),
				value: count.length,
				names: count.map((b) => b.name),
			});
		}
		return result;
	}, [data]);

	return (
		<Col xs={24} md={12}>
			<Typography.Title level={5}>
				{t("app.statistics.age_distribution")}
			</Typography.Title>
			<Area
				data={distributionData}
				xField="age"
				yField="value"
				height={300}
				shapeField="smooth"
				style={{ fill: "linear-gradient(-90deg, white 0%, #1890ff 100%)" }}
				tooltip={{
					title: (d) => `${t("table.age")} ${d.age}`,
					items: [
						{ field: "value", name: t("app.statistics.count") },
						{
							field: "names",
							name: t("table.name"),
							valueFormatter: (v: string[]) => v.join(", "),
						},
					],
				}}
			/>
		</Col>
	);
};

const BirthHeatmap = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
	const heatmapData = useMemo(() => {
		const months = Array.from({ length: 12 }, (_, i) => i);
		const days = Array.from({ length: 31 }, (_, i) => i + 1);

		return months.flatMap((m) =>
			days.flatMap((d) => {
				const births = data.filter((x) => x.month === m + 1 && x.day === d);
				if (births.length === 0) return [];
				const key = monthNames[m];
				if (!key) throw new Error(`Invalid month index ${m}`);
				return [
					{
						month: t(`data.months.${key}`),
						day: d.toString(),
						value: births.length,
						names: births.map((b) => b.name),
					},
				];
			}),
		);
	}, [data, t]);

	return (
		<Col xs={24}>
			<Typography.Title level={5}>
				{t("app.statistics.birth_heatmap")}
			</Typography.Title>
			<Heatmap
				data={heatmapData}
				xField="day"
				yField="month"
				colorField="value"
				height={300}
				mark="cell"
				style={{ inset: 0.5 }}
				scale={{
					x: {
						type: "band",
						domain: Array.from({ length: 31 }, (_, i) => (i + 1).toString()),
					},
					y: {
						type: "band",
						domain: monthNames.map((m) => t(`data.months.${m}`)),
					},
				}}
				tooltip={{
					title: (d) => `${d.month} ${d.day}`,
					items: [
						{ field: "value", name: t("app.statistics.count") },
						{
							field: "names",
							name: t("table.name"),
							valueFormatter: (v: string[]) => v.join(", "),
						},
					],
				}}
			/>
		</Col>
	);
};

const StatColumn = <T extends Datum>({
	title,
	data,
}: {
	title: string;
	data: T[];
}) => {
	const { t } = useTranslation();
	return (
		<Col xs={24} sm={12} md={8}>
			<Typography.Title level={5}>{title}</Typography.Title>
			<Column
				data={data}
				xField="type"
				yField="value"
				height={200}
				axis={{ y: { grid: false } }}
				tooltip={{
					title: (d) => d.type,
					items: [
						{ field: "value", channel: "y", name: t("app.statistics.count") },
						{
							field: "names",
							channel: "color",
							name: t("table.name"),
							valueFormatter: (v: string[]) => v.join(", "),
						},
					],
				}}
				onEvent={(_, event) => {
					if (event.type === "element:click") {
						const datum = event.data?.data;
						if (datum?.type) {
							store.search = datum.type;
							window.scrollTo({ top: 0, behavior: "smooth" });
						}
					}
				}}
			/>
		</Col>
	);
};

const StatPie = <T extends Datum>({
	title,
	data,
}: {
	title: string;
	data: T[];
}) => {
	const { t } = useTranslation();
	return (
		<Col xs={24} sm={12} md={8}>
			<Typography.Title level={5}>{title}</Typography.Title>
			<Pie
				data={data}
				angleField="value"
				colorField="type"
				height={250}
				legend={{ layout: "horizontal", position: "bottom" }}
				label={{ text: "value", position: "outside" }}
				tooltip={{
					title: (d) => d.type,
					items: [
						{ field: "value", channel: "y", name: t("app.statistics.count") },
						{
							field: "names",
							channel: "color",
							name: t("table.name"),
							valueFormatter: (v: string[]) => v.join(", "),
						},
					],
				}}
				onEvent={(_, event) => {
					if (event.type === "element:click") {
						const datum = event.data?.data;
						if (datum?.type) {
							store.search = datum.type;
							window.scrollTo({ top: 0, behavior: "smooth" });
						}
					}
				}}
			/>
		</Col>
	);
};

const AgePyramid = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
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

		return groups.flatMap((group) => {
			const range = group === "90+" ? [90, 200] : group.split("-").map(Number);
			const range0 = range[0] as number;
			const range1 = range[1] as number;
			const boys = data.filter(
				(b) => b.kind === "♂️" && b.age >= range0 && b.age <= range1,
			);
			const girls = data.filter(
				(b) => b.kind === "♀️" && b.age >= range0 && b.age <= range1,
			);

			return [
				{
					group,
					gender: "♂️",
					value: -boys.length,
					names: boys.map((b) => b.name),
				},
				{
					group,
					gender: "♀️",
					value: girls.length,
					names: girls.map((b) => b.name),
				},
			];
		});
	}, [data]);

	return (
		<Col xs={24} md={12}>
			<Typography.Title level={5}>
				{t("app.statistics.pyramid")}
			</Typography.Title>
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
							name: t("app.statistics.count"),
							valueFormatter: (v: number) => Math.abs(v),
						},
						{
							field: "names",
							name: t("table.name"),
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
	const { t } = useTranslation();
	const dataSnap = useSnapshot(dataStore);
	const data = dataSnap.filtered;
	const dayjsLocale = dayjs.locale();

	const stats = useMemo(() => {
		dayjs.locale(dayjsLocale);
		return {
			letters: getDistribution(data, (x) => (x.name[0] || "?").toUpperCase()),
			signs: getDistribution(data, (x) => t(`data.zodiac.${x.sign}`)),
			months: getDistribution(data, (x) => {
				const key = monthNames[x.month - 1];
				if (!key) throw new Error(`Invalid month index ${x.month - 1}`);
				return t(`data.months.${key}`);
			}),
			ageGroups: getDistribution(data, (x) =>
				t(`data.age_groups.${x.ageGroup}`),
			),
			days: getDistribution(data, (x) => dayjs(x.birthday).format("dddd")),
			decades: getDistribution(data, (x) => x.decade),
			generations: getDistribution(data, (x) =>
				t(`data.generations.${x.generation}`),
			),
			seasons: getDistribution(data, (x) => t(`data.seasons.${x.season}`)),
			kinds: getDistribution(data, (x) => x.kind),
			elements: getDistribution(data, (x) => t(`data.elements.${x.element}`)),
			birthgems: getDistribution(
				data,
				(x) => `${t(`data.birthgems.${x.birthgem}`)} ${x.birthgemEmoji}`,
			),
			chineseZodiac: getDistribution(data, (x) =>
				t(`data.chinese_zodiac.${x.chineseZodiac}`),
			),
		};
	}, [data, t, dayjsLocale]);

	return (
		<Card
			title={t("app.statistics.title")}
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
				<StatPie title={t("app.statistics.zodiac")} data={stats.signs} />
				<StatPie
					title={t("app.statistics.chinese")}
					data={stats.chineseZodiac}
				/>
				<StatPie title={t("app.statistics.elements")} data={stats.elements} />
				<StatPie title={t("app.statistics.gender")} data={stats.kinds} />
				<StatPie
					title={t("app.statistics.age_groups")}
					data={stats.ageGroups}
				/>
				<StatPie
					title={t("app.statistics.generations")}
					data={stats.generations}
				/>
				<StatPie title={t("app.statistics.seasons")} data={stats.seasons} />
				<StatColumn
					title={t("app.statistics.first_letter")}
					data={stats.letters}
				/>
				<StatColumn title={t("app.statistics.month")} data={stats.months} />
				<StatColumn
					title={t("app.statistics.birthstones")}
					data={stats.birthgems}
				/>
				<StatColumn title={t("app.statistics.day_of_week")} data={stats.days} />
				<StatColumn title={t("app.statistics.decades")} data={stats.decades} />
				<AgeDistribution data={data} />
				<AgePyramid data={data} />
				<BirthHeatmap data={data} />
			</Row>
		</Card>
	);
};
