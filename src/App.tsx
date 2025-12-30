import { Card, ConfigProvider, Layout, Space, Tabs, theme } from "antd";
import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { BirthdayTable } from "./BirthdayTable";
import { birthdays } from "./birthdays";
import { CalendarActions } from "./CalendarActions";
import { Countdown } from "./Countdown";
import { triggerConfetti } from "./celebration";
import { FilterButtons, FilterSearch } from "./Filter";
import { MilestonesWidget } from "./MilestonesWidget";
import { checkAndNotify } from "./notifications";
import { Statistics } from "./Statistics";
import { dataStore, store } from "./store";
import { TimelineView } from "./TimelineView";

export const App = () => {
	const dataSnap = useSnapshot(dataStore);
	const storeSnap = useSnapshot(store);
	const data = dataSnap.filtered;

	useEffect(() => {
		checkAndNotify(data);

		const todayCelebrations = birthdays.filter(
			(b) => b.daysBeforeBirthday === 0,
		);
		if (todayCelebrations.length > 0) {
			triggerConfetti();
		}
	}, [data]);

	const nextBirthday = birthdays.find((b) => b.daysBeforeBirthday >= 0);

	return (
		<ConfigProvider
			theme={{
				algorithm: storeSnap.darkMode
					? theme.darkAlgorithm
					: theme.defaultAlgorithm,
			}}
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
				<Layout.Content style={{ padding: 16 }}>
					{nextBirthday && <Countdown nextBirthday={nextBirthday} />}
					<Card title="Birthdays" size="small">
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
									label: "Table",
									children: <BirthdayTable data={data} />,
								},
								{
									key: "timeline",
									label: "Timeline",
									children: <TimelineView data={data} />,
								},
							]}
						/>
					</Card>
					<MilestonesWidget />
					<Statistics />
				</Layout.Content>
				<AppFooter />
			</Layout>
		</ConfigProvider>
	);
};
