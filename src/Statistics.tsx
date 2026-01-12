import { Card, Row, Skeleton } from "antd";
import dayjs from "dayjs";
import { lazy, Suspense, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { type Birthday, monthNames } from "./birthdays";
import { dataStore } from "./store";

// Lazy load chart components
const StatPie = lazy(() =>
	import("./stats/StatPie").then((m) => ({ default: m.StatPie })),
);
const StatColumn = lazy(() =>
	import("./stats/StatColumn").then((m) => ({ default: m.StatColumn })),
);
const AgeDistribution = lazy(() =>
	import("./stats/AgeDistribution").then((m) => ({
		default: m.AgeDistribution,
	})),
);
const AgePyramid = lazy(() =>
	import("./stats/AgePyramid").then((m) => ({ default: m.AgePyramid })),
);
const BirthHeatmap = lazy(() =>
	import("./stats/BirthHeatmap").then((m) => ({ default: m.BirthHeatmap })),
);

const ChartSkeleton = () => (
	<div style={{ padding: 20 }}>
		<Skeleton active paragraph={{ rows: 8 }} />
	</div>
);

type Datum = {
	type: string;
	value: number;
	names: string[];
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
			<Suspense fallback={<ChartSkeleton />}>
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
					<StatColumn
						title={t("app.statistics.day_of_week")}
						data={stats.days}
					/>
					<StatColumn
						title={t("app.statistics.decades")}
						data={stats.decades}
					/>
					<AgeDistribution data={data} />
					<AgePyramid data={data} />
					<BirthHeatmap data={data} />
				</Row>
			</Suspense>
		</Card>
	);
};
