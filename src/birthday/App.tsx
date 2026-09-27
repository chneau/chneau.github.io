import {
	type MantineColorsTuple,
	MantineProvider,
	Modal,
	Tabs,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { Plus } from "lucide-react";
import {
	type CSSProperties,
	lazy,
	Suspense,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { createAppTheme, Grain, Skeleton } from "../shared";
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { BirthdayDetails } from "./BirthdayDetails";
import { BirthdayTable } from "./BirthdayTable";
import { birthdays } from "./birthdays";
import { CalendarActions } from "./CalendarActions";
import { CompatibilityMatrix } from "./CompatibilityMatrix";
import { Countdown } from "./Countdown";
import { triggerConfetti } from "./celebration";
import { ErrorBoundary } from "./ErrorBoundary";
import { FilterButtons, FilterSearch } from "./Filter";
import { ManageBirthdaysModal } from "./ManageBirthdaysModal";
import { MilestonesWidget } from "./MilestonesWidget";
import { checkAndNotify } from "./notifications";
import { RecordsWidget } from "./RecordsWidget";
import { dataStore, store } from "./store";
import { TimelineView } from "./TimelineView";
import { WeatherTab } from "./WeatherTab";

const Statistics = lazy(() =>
	import("./Statistics").then((m) => ({ default: m.Statistics })),
);

/** Emerald accent matching the existing zinc/emerald taste theme. */
const emerald: MantineColorsTuple = [
	"#e6fbf3",
	"#c3f3e1",
	"#9de9cd",
	"#74dfb8",
	"#52d6a8",
	"#34d399",
	"#12b485",
	"#0f9d76",
	"#0c7f60",
	"#085843",
];

const appTheme = createAppTheme({
	accent: emerald,
	accentName: "emerald",
	primaryShade: { light: 6, dark: 5 },
	components: {
		Modal: { defaultProps: { centered: true, radius: "lg" } },
		Card: { defaultProps: { radius: "lg" } },
		Button: { defaultProps: { radius: "md" } },
	},
});

const StatisticsSkeleton = () => (
	<div
		className="tk-surface"
		role="status"
		aria-label="Loading insights"
		aria-busy="true"
	>
		<Skeleton height={18} width={160} style={{ marginBottom: 20 }} />
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
				gap: 16,
			}}
		>
			{["a", "b", "c", "d", "e", "f"].map((id) => (
				<Skeleton key={id} height={220} radius={18} />
			))}
		</div>
	</div>
);

export const App = () => {
	const dataSnap = useSnapshot(dataStore);
	const storeSnap = useSnapshot(store);
	const data = dataSnap.filtered;
	const { t } = useTranslation();
	const [manageOpen, setManageOpen] = useState(false);

	useEffect(() => {
		document.documentElement.dataset.theme = storeSnap.darkMode
			? "dark"
			: "light";
	}, [storeSnap.darkMode]);

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

	const tabItems = [
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
	];

	return (
		<MantineProvider
			theme={appTheme}
			forceColorScheme={storeSnap.darkMode ? "dark" : "light"}
		>
			<Notifications position="top-right" />
			<div className="tk-shell">
				<AppHeader data={data} onOpenManage={() => setManageOpen(true)} />

				<main className="tk-main">
					<div className="tk-container tk-stack">
						<Countdown
							birthdays={nextBirthdays}
							onManage={() => setManageOpen(true)}
						/>

						<section
							className="tk-surface reveal"
							style={{ "--i": 2 } as CSSProperties}
						>
							<div className="tk-toolbar">
								<div className="tk-toolbar__group">
									<CalendarActions />
									<button
										type="button"
										className="tk-iconbtn"
										onClick={() => setManageOpen(true)}
									>
										<Plus size={15} strokeWidth={2} />
										<span className="tk-iconbtn__label">
											{t("app.hero.add")}
										</span>
									</button>
								</div>
								<FilterButtons />
							</div>

							<FilterSearch style={{ marginBottom: 18 }} />

							<Tabs defaultValue="table">
								<Tabs.List>
									{tabItems.map((item) => (
										<Tabs.Tab key={item.key} value={item.key}>
											{item.label}
										</Tabs.Tab>
									))}
								</Tabs.List>
								{tabItems.map((item) => (
									<Tabs.Panel key={item.key} value={item.key} pt="md">
										{item.children}
									</Tabs.Panel>
								))}
							</Tabs>
						</section>

						<ErrorBoundary label="Milestones">
							<MilestonesWidget />
						</ErrorBoundary>

						<ErrorBoundary label="Records">
							<RecordsWidget data={data} />
						</ErrorBoundary>

						<ErrorBoundary label="Statistics">
							<Suspense fallback={<StatisticsSkeleton />}>
								<Statistics />
							</Suspense>
						</ErrorBoundary>
					</div>
				</main>

				<AppFooter />
			</div>

			<ManageBirthdaysModal
				open={manageOpen}
				onClose={() => setManageOpen(false)}
			/>

			<Modal
				title={
					dataSnap.selectedBirthday
						? `${dataSnap.selectedBirthday.name} ${dataSnap.selectedBirthday.kind} (${dataSnap.selectedBirthday.birthdayString})`
						: undefined
				}
				opened={Boolean(dataSnap.selectedBirthday)}
				onClose={() => {
					dataStore.selectedBirthday = null;
				}}
				size="xl"
			>
				{dataSnap.selectedBirthday && (
					<div style={{ marginTop: 16 }}>
						<BirthdayDetails record={dataSnap.selectedBirthday} />
					</div>
				)}
			</Modal>

			<Grain />
		</MantineProvider>
	);
};
