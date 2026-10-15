import {
	type MantineColorsTuple,
	MantineProvider,
	Modal,
	Tabs,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { Keyboard, LayoutGrid, Moon, Plus, Sun } from "lucide-react";
import {
	type CSSProperties,
	lazy,
	type ReactNode,
	Suspense,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import {
	type Command,
	CommandPalette,
	createAppTheme,
	Grain,
	LoadingState,
	Skeleton,
	SkipLink,
	useCommandPalette,
	useShortcutsHelp,
} from "../shared";
import { useThemeMode } from "../shared/hooks/useThemeMode";
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
import { checkAndNotify, subscribeDayRollNotification } from "./notifications";
import { RecordsWidget } from "./RecordsWidget";
import { dataStore } from "./store";
import { TimelineView } from "./TimelineView";
import { useTrackedBirthdays } from "./useTrackedBirthdays";
import { WeatherTab } from "./WeatherTab";

const Statistics = lazy(() =>
	import("./Statistics").then((m) => ({ default: m.Statistics })),
);

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

const TAB_KEYS = ["table", "timeline", "compatibility", "weather"] as const;

type TabKey = (typeof TAB_KEYS)[number];

const isTabKey = (value: string | null): value is TabKey =>
	value !== null && (TAB_KEYS as readonly string[]).includes(value);

const readInitialTab = (): TabKey => {
	if (typeof window === "undefined") return "table";
	const tab = new URLSearchParams(window.location.search).get("tab");
	return isTabKey(tab) ? tab : "table";
};

const StatisticsSkeleton = () => {
	const { t } = useTranslation();
	return (
		<LoadingState label={t("app.loading")} hideLabel className="tk-surface">
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
		</LoadingState>
	);
};

export const App = () => {
	const dataSnap = useSnapshot(dataStore);
	const data = dataSnap.filtered;
	const { t } = useTranslation();
	const [manageOpen, setManageOpen] = useState(false);
	const shortcuts = useShortcutsHelp();
	const { dark, toggle } = useThemeMode();
	const palette = useCommandPalette();
	const [activeTab, setActiveTab] = useState<TabKey>(readInitialTab);

	useEffect(() => {
		const url = new URL(window.location.href);
		if (url.searchParams.get("tab") === activeTab) return;
		url.searchParams.set("tab", activeTab);
		window.history.replaceState(null, "", url);
	}, [activeTab]);

	useEffect(() => {
		void checkAndNotify(birthdays);
		if (birthdays.some((b) => b.daysBeforeBirthday === 0)) {
			triggerConfetti();
		}
		return subscribeDayRollNotification(() => birthdays);
	}, []);

	const trackedBirthdays = useTrackedBirthdays();
	const nextBirthdays = useMemo(
		() => trackedBirthdays.filter((b) => b.daysBeforeBirthday >= 0).slice(0, 3),
		[trackedBirthdays],
	);

	const tabItems: { key: TabKey; label: string; children: ReactNode }[] = [
		{
			key: "table",
			label: t("app.table.title"),
			children: (
				<ErrorBoundary label={t("app.table.title")}>
					<BirthdayTable data={data} />
				</ErrorBoundary>
			),
		},
		{
			key: "timeline",
			label: t("app.timeline.title"),
			children: (
				<ErrorBoundary label={t("app.timeline.title")}>
					<TimelineView data={data} />
				</ErrorBoundary>
			),
		},
		{
			key: "compatibility",
			label: t("app.compatibility.title"),
			children: (
				<ErrorBoundary label={t("app.compatibility.title")}>
					<CompatibilityMatrix data={data} />
				</ErrorBoundary>
			),
		},
		{
			key: "weather",
			label: t("app.weather.title"),
			children: (
				<ErrorBoundary label={t("app.weather.title")}>
					<WeatherTab />
				</ErrorBoundary>
			),
		},
	];

	const commands: Command[] = [
		{
			id: "toggle-theme",
			label: dark
				? t("app.command.switch_light")
				: t("app.command.switch_dark"),
			hint: t("app.command.appearance"),
			keywords: "theme dark light appearance mode toggle",
			icon: dark ? <Sun size={16} /> : <Moon size={16} />,
			run: toggle,
		},
		{
			id: "keyboard-shortcuts",
			label: t("app.command.keyboard_shortcuts"),
			hint: t("app.command.help"),
			keywords: "keyboard shortcuts keys help",
			icon: <Keyboard size={16} />,
			run: () => shortcuts.open(),
		},
		...tabItems.map((item) => ({
			id: `tab-${item.key}`,
			label: t("app.command.go_to", { tab: item.label }),
			hint: t("app.command.tab"),
			keywords: `tab ${item.key}`,
			icon: <LayoutGrid size={16} />,
			run: () => setActiveTab(item.key),
		})),
	];

	return (
		<MantineProvider
			theme={appTheme}
			forceColorScheme={dark ? "dark" : "light"}
		>
			<SkipLink />
			<Notifications position="top-right" />
			<div className="tk-shell">
				<AppHeader
					data={birthdays}
					onOpenManage={() => setManageOpen(true)}
					shortcuts={[
						{
							title: t("app.command.search_filters"),
							shortcuts: [
								{ keys: ["/"], description: t("app.command.focus_search") },
							],
						},
					]}
				/>

				<main className="tk-main" id="main">
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

							<Tabs
								value={activeTab}
								onChange={(value) => {
									if (isTabKey(value)) setActiveTab(value);
								}}
							>
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

						<ErrorBoundary label={t("app.milestones.title")}>
							<MilestonesWidget />
						</ErrorBoundary>

						<ErrorBoundary label={t("app.records.title")}>
							<RecordsWidget data={data} />
						</ErrorBoundary>

						<ErrorBoundary label={t("app.statistics.title")}>
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

			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
