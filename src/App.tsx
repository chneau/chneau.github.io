import { ConfigProvider as ChartConfigProvider } from "@ant-design/charts";
import { Card, ConfigProvider, Layout, Space, Tabs, theme } from "antd";
import deDE from "antd/locale/de_DE";
import enUS from "antd/locale/en_US";
import esES from "antd/locale/es_ES";
import frFR from "antd/locale/fr_FR";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { BirthdayTable } from "./BirthdayTable";
import { birthdays } from "./birthdays";
import { CalendarActions } from "./CalendarActions";
import { CompatibilityMatrix } from "./CompatibilityMatrix";
import { Countdown } from "./Countdown";
import { triggerConfetti } from "./celebration";
import { FilterButtons, FilterSearch } from "./Filter";
import { MilestonesWidget } from "./MilestonesWidget";
import { checkAndNotify } from "./notifications";
import { RecordsWidget } from "./RecordsWidget";
import { Statistics } from "./Statistics";
import { dataStore, store } from "./store";
import { TimelineView } from "./TimelineView";
import { WeatherTab } from "./WeatherTab";

export const App = () => {
	const dataSnap = useSnapshot(dataStore);
	const storeSnap = useSnapshot(store);
	const data = dataSnap.filtered;
	const { t, i18n } = useTranslation();

	const antdLocale = useMemo(() => {
		const lang = i18n.language.slice(0, 2);
		const locales: Record<string, typeof enUS> = {
			fr: frFR,
			ty: frFR,
			es: esES,
			de: deDE,
			zh: zhCN,
		};
		return locales[lang] || enUS;
	}, [i18n.language]);

	useEffect(() => {
		checkAndNotify(birthdays);

		if (birthdays.some((b) => b.daysBeforeBirthday === 0)) {
			triggerConfetti();
		}
	}, []);

	const nextBirthdays = useMemo(
		() => birthdays.filter((b) => b.daysBeforeBirthday >= 0).slice(0, 3),
		[],
	);

	return (
		<ConfigProvider
			locale={antdLocale}
			theme={{
				algorithm: storeSnap.darkMode
					? theme.darkAlgorithm
					: theme.defaultAlgorithm,
			}}
		>
			<ChartConfigProvider
				common={{ theme: storeSnap.darkMode ? "dark" : "light" }}
			>
				<style>
					{`
					.birthday-today-row {
						background-color: rgba(255, 77, 79, 0.15) !important;
						font-weight: bold;
					}
					.birthday-today-row:hover > td {
						background-color: rgba(255, 77, 79, 0.25) !important;
					}
				`}
				</style>
				<Layout style={{ minHeight: "100vh" }}>
					<AppHeader data={data} />
					<Layout.Content style={{ padding: 16, minHeight: "100vh" }}>
						<div style={{ minHeight: nextBirthdays.length > 0 ? 120 : 0 }}>
							{nextBirthdays.length > 0 && (
								<Countdown birthdays={nextBirthdays} />
							)}
						</div>
						<Card
							title={t("app.birthdays")}
							size="small"
							style={{ minHeight: 600 }}
						>
							<Space
								orientation="vertical"
								style={{ width: "100%", marginBottom: 16 }}
								size="middle"
							>
								<Space
									wrap
									style={{ justifyContent: "space-between", width: "100%" }}
								>
									<Space wrap>
										<CalendarActions />
									</Space>
									<FilterButtons />
								</Space>
								<FilterSearch style={{ width: "100%" }} />
							</Space>
							<Tabs
								defaultActiveKey="table"
								items={[
									{
										key: "table",
										label: t("app.table.title"),
										children: <BirthdayTable data={data} />,
									},
									{
										key: "timeline",
										label: t("app.timeline.title"),
										children: <TimelineView data={data} />,
									},
									{
										key: "compatibility",
										label: t("app.compatibility.title"),
										children: <CompatibilityMatrix data={data} />,
									},
									{
										key: "weather",
										label: t("app.weather.title"),
										children: <WeatherTab />,
									},
								]}
							/>
						</Card>
						<MilestonesWidget />
						<RecordsWidget data={data} />
						<Statistics />
					</Layout.Content>
					<AppFooter />
				</Layout>
			</ChartConfigProvider>
		</ConfigProvider>
	);
};
