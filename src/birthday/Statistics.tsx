import { AreaChart, BarChart, PieChart } from "@mantine/charts";
import { Box, Card, Grid, Paper, Text, Title, Tooltip } from "@mantine/core";
import dayjs from "dayjs";
import { groupBy } from "es-toolkit";
import { BarChart3, RotateCcw } from "lucide-react";
import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TooltipContentProps } from "recharts";
import { useSnapshot } from "valtio";
import { EmptyState } from "../shared";
import { type Birthday, monthNames } from "./birthdays";
import { dataStore, resetFilters } from "./store";

type Datum = {
	type: string;
	value: number;
	names: string[];
};

/** A restrained, non-purple categorical palette that sits with the emerald UI. */
const CHART_PALETTE = [
	"#34d399",
	"#7dd3fc",
	"#e6c069",
	"#ef9a9a",
	"#5eead4",
	"#bef264",
	"#fdba74",
	"#a1a1aa",
	"#86efac",
	"#67e8f9",
];

const paletteColor = (index: number): string =>
	CHART_PALETTE[index % CHART_PALETTE.length] ?? "#34d399";

const getDistribution = (
	data: readonly Birthday[],
	getValue: (b: Birthday) => string | undefined,
): Datum[] => {
	const grouped = groupBy(data, (b) => getValue(b) ?? "undefined");
	return Object.entries(grouped)
		.filter(([type]) => type !== "undefined")
		.map(([type, items]) => ({
			type,
			value: items.length,
			names: items.map((i) => i.name),
		}))
		.sort((a, b) => b.value - a.value);
};

/** Recharts tooltip content that also lists the names behind a value. */
const nameTooltip =
	(countLabel: string) =>
	({ active, payload }: TooltipContentProps) => {
		if (!active || !payload?.length) return null;
		const datum = payload[0]?.payload as Datum | undefined;
		if (!datum) return null;
		return (
			<Paper withBorder p="xs" radius="md" shadow="md">
				<Text size="xs" fw={600}>
					{datum.type}
				</Text>
				<Text size="xs" c="dimmed">
					{countLabel}: {datum.value}
				</Text>
				<Text size="xs" c="dimmed" style={{ maxWidth: 260 }}>
					{datum.names.join(", ")}
				</Text>
			</Paper>
		);
	};

const pyramidTooltip =
	(boysLabel: string, girlsLabel: string) =>
	({ active, payload }: TooltipContentProps) => {
		if (!active || !payload?.length) return null;
		const datum = payload[0]?.payload as
			| { group: string; boys: number; girls: number; names: string[] }
			| undefined;
		if (!datum) return null;
		return (
			<Paper withBorder p="xs" radius="md" shadow="md">
				<Text size="xs" fw={600}>
					{datum.group}
				</Text>
				<Text size="xs" c="dimmed">
					{boysLabel}: {Math.abs(datum.boys)} · {girlsLabel}: {datum.girls}
				</Text>
				<Text size="xs" c="dimmed" style={{ maxWidth: 260 }}>
					{datum.names.join(", ")}
				</Text>
			</Paper>
		);
	};

const StatPie = ({ title, data }: { title: string; data: Datum[] }) => {
	const { t } = useTranslation();
	const chartData = data.map((datum, index) => ({
		name: datum.type,
		value: datum.value,
		color: paletteColor(index),
	}));
	return (
		<Grid.Col span={{ base: 12, sm: 6, md: 4 }} style={{ minHeight: 300 }}>
			<Title order={5}>{title}</Title>
			<PieChart
				h={250}
				data={chartData}
				withLegend
				tooltipDataSource="segment"
				tooltipProps={{ content: nameTooltip(t("app.statistics.count")) }}
			/>
		</Grid.Col>
	);
};

const StatColumn = ({ title, data }: { title: string; data: Datum[] }) => {
	const { t } = useTranslation();
	return (
		<Grid.Col span={{ base: 12, sm: 6, md: 4 }} style={{ minHeight: 250 }}>
			<Title order={5}>{title}</Title>
			<BarChart
				h={200}
				data={data}
				dataKey="type"
				series={[
					{
						name: "value",
						label: t("app.statistics.count"),
						color: "teal.5",
					},
				]}
				gridAxis="y"
				tooltipProps={{ content: nameTooltip(t("app.statistics.count")) }}
			/>
		</Grid.Col>
	);
};

const AgeDistribution = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
	const distributionData = useMemo(() => {
		if (data.length === 0) return [];
		const byAge = groupBy(data, (b) => b.age);
		const ages = Object.keys(byAge).map(Number);
		const minAge = Math.min(...ages);
		const maxAge = Math.max(...ages);
		const result = [];
		for (let i = minAge; i <= maxAge; i++) {
			const items = byAge[i] ?? [];
			result.push({
				age: i.toString(),
				value: items.length,
				names: items.map((b) => b.name),
			});
		}
		return result;
	}, [data]);

	return (
		<Grid.Col span={{ base: 12, md: 12 }} style={{ minHeight: 350 }}>
			<Title order={5}>{t("app.statistics.age_distribution")}</Title>
			<AreaChart
				h={300}
				data={distributionData}
				dataKey="age"
				series={[
					{
						name: "value",
						label: t("app.statistics.count"),
						color: "blue.5",
					},
				]}
				withGradient
				curveType="natural"
				tooltipProps={{ content: nameTooltip(t("app.statistics.count")) }}
			/>
		</Grid.Col>
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

		const parsedGroups = groups.map((group) => {
			const [min, max] =
				group === "90+"
					? [90, 200]
					: (group.split("-").map(Number) as [number, number]);
			return { group, min, max };
		});

		return parsedGroups.map(({ group, min, max }) => {
			const inRange = data.filter((b) => b.age >= min && b.age <= max);
			const boys = inRange.filter((b) => b.kind === "♂️");
			const girls = inRange.filter((b) => b.kind === "♀️");
			return {
				group,
				boys: -boys.length,
				girls: girls.length,
				names: inRange.map((b) => b.name),
			};
		});
	}, [data]);

	return (
		<Grid.Col span={{ base: 12, md: 12 }} style={{ minHeight: 350 }}>
			<Title order={5}>{t("app.statistics.pyramid")}</Title>
			<BarChart
				h={300}
				data={pyramidData}
				dataKey="group"
				type="stacked"
				orientation="vertical"
				series={[
					{
						name: "boys",
						label: t("app.filters.boys"),
						color: "blue.5",
						stackId: "a",
					},
					{
						name: "girls",
						label: t("app.filters.girls"),
						color: "pink.5",
						stackId: "a",
					},
				]}
				valueFormatter={(value) => `${Math.abs(value)}`}
				tooltipProps={{
					content: pyramidTooltip(
						t("app.filters.boys"),
						t("app.filters.girls"),
					),
				}}
			/>
		</Grid.Col>
	);
};

const BirthHeatmap = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
	const { byDate, peak } = useMemo(() => {
		const grouped = groupBy(data, (b) => `${b.month}-${b.day}`);
		const counts: Record<string, number> = {};
		let max = 0;
		for (const [key, items] of Object.entries(grouped)) {
			counts[key] = items.length;
			max = Math.max(max, items.length);
		}
		return { byDate: counts, peak: max || 1 };
	}, [data]);

	const days = Array.from({ length: 31 }, (_, i) => i + 1);

	return (
		<Grid.Col span={{ base: 12 }} style={{ minHeight: 350 }}>
			<Title order={5}>{t("app.statistics.birth_heatmap")}</Title>
			<Box style={{ overflowX: "auto", paddingBottom: 4 }}>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "84px repeat(31, minmax(14px, 1fr))",
						gap: 3,
						minWidth: 560,
					}}
				>
					<div />
					{days.map((day) => (
						<div
							key={`d-${day}`}
							className="sr-num"
							style={{
								fontSize: 9,
								textAlign: "center",
								color: "var(--tk-text-faint)",
							}}
						>
							{day}
						</div>
					))}
					{monthNames.map((monthKey, monthIndex) => {
						const label = t(`data.months.${monthKey}`);
						return (
							<Fragment key={monthKey}>
								<div
									style={{
										fontSize: 11,
										color: "var(--tk-text-dim)",
										display: "flex",
										alignItems: "center",
									}}
								>
									{label}
								</div>
								{days.map((day) => {
									const count = byDate[`${monthIndex + 1}-${day}`] ?? 0;
									const alpha = count ? 0.2 + (count / peak) * 0.8 : 0;
									const cell = (
										<div
											style={{
												height: 16,
												borderRadius: 4,
												background: count
													? `rgba(52, 211, 153, ${alpha})`
													: "var(--tk-surface-2)",
												border: count
													? "1px solid var(--tk-accent-line)"
													: "1px solid transparent",
											}}
										/>
									);
									if (!count) return <Fragment key={day}>{cell}</Fragment>;
									return (
										<Tooltip
											key={day}
											label={`${label} ${day}: ${count}`}
											withArrow
											position="top"
										>
											{cell}
										</Tooltip>
									);
								})}
							</Fragment>
						);
					})}
				</div>
			</Box>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					marginTop: 10,
					fontSize: 11,
					color: "var(--tk-text-dim)",
				}}
			>
				<span>{t("app.statistics.heatmap_less")}</span>
				{[0.2, 0.4, 0.6, 0.8, 1].map((alpha) => (
					<span
						key={alpha}
						aria-hidden="true"
						style={{
							width: 16,
							height: 12,
							borderRadius: 3,
							background: `rgba(52, 211, 153, ${alpha})`,
							border: "1px solid var(--tk-accent-line)",
						}}
					/>
				))}
				<span>{t("app.statistics.heatmap_more")}</span>
			</div>
		</Grid.Col>
	);
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

	const handleResetFilters = () => {
		resetFilters();
	};

	if (data.length === 0) {
		return (
			<Card withBorder padding="lg" style={{ marginTop: 16 }}>
				<EmptyState
					icon={<BarChart3 size={20} strokeWidth={1.5} />}
					title={t("app.list.empty_title")}
					body={t("app.list.empty_body")}
					action={
						<button
							type="button"
							className="tk-iconbtn"
							onClick={handleResetFilters}
						>
							<RotateCcw size={14} strokeWidth={1.9} />
							{t("app.list.reset")}
						</button>
					}
				/>
			</Card>
		);
	}

	return (
		<Card withBorder padding="lg" style={{ marginTop: 16 }}>
			<Title order={4} mb="md">
				{t("app.statistics.title")}
			</Title>
			<Grid gap="md">
				<StatPie title={t("app.statistics.zodiac")} data={stats.signs} />
				<StatPie
					title={t("app.statistics.chinese")}
					data={stats.chineseZodiac}
				/>
				<StatPie
					title={t("app.statistics.birthstones")}
					data={stats.birthgems}
				/>
				<StatPie title={t("app.statistics.elements")} data={stats.elements} />
				<StatPie title={t("app.statistics.seasons")} data={stats.seasons} />
				<StatPie
					title={t("app.statistics.generations")}
					data={stats.generations}
				/>
				<StatColumn
					title={t("app.statistics.age_groups")}
					data={stats.ageGroups}
				/>
				<StatColumn
					title={t("app.statistics.first_letter")}
					data={stats.letters}
				/>
				<StatColumn title={t("app.statistics.month")} data={stats.months} />
				<StatColumn title={t("app.statistics.day_of_week")} data={stats.days} />
				<StatColumn title={t("app.statistics.decades")} data={stats.decades} />
				<StatColumn title={t("app.statistics.gender")} data={stats.kinds} />
				<AgeDistribution data={data} />
				<AgePyramid data={data} />
				<BirthHeatmap data={data} />
			</Grid>
		</Card>
	);
};
