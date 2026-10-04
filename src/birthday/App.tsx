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
	Skeleton,
	SkipLink,
	useCommandPalette,
	useShortcutsHelp,
} from "../shared";
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
import { dataStore, store } from "./store";
import { TimelineView } from "./TimelineView";
import { useTrackedBirthdays } from "./useTrackedBirthdays";
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

const TAB_KEYS = ["table", "timeline", "compatibility", "weather"] as const;

type TabKey = (typeof TAB_KEYS)[number];

const isTabKey = (value: string | null): value is TabKey =>
	value !== null && (TAB_KEYS as readonly string[]).includes(value);

/** Read the active tab from `?tab=<id>`, falling back to the default tab. */
const readInitialTab = (): TabKey => {
	if (typeof window === "undefined") return "table";
	const tab = new URLSearchParams(window.location.search).get("tab");
	return isTabKey(tab) ? tab : "table";
};

const StatisticsSkeleton = () => {
	const { t } = useTranslation();
	return (
		<div
			className="tk-surface"
			role="status"
			aria-label={t("app.loading")}
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
};

export const App = () => {
	const dataSnap = useSnapshot(dataStore);
	const storeSnap = useSnapshot(store);
	const data = dataSnap.filtered;
	const { t } = useTranslation();
	const [manageOpen, setManageOpen] = useState(false);
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();
	const [activeTab, setActiveTab] = useState<TabKey>(readInitialTab);

	useEffect(() => {
		document.documentElement.dataset.theme = storeSnap.darkMode
			? "dark"
			: "light";
	}, [storeSnap.darkMode]);

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
		// The date-roll watcher recomputes `birthdays` when the calendar day
		// advances, so subscribing here is what makes a birthday arriving while
		// the tab sits open announce itself. `checkAndNotify`'s once-per-day
		// latch keeps the re-check quiet on every other recompute (and on remount).
		return subscribeDayRollNotification(() => birthdays);
	}, []);

	/**
	 * The header strip's three soonest upcoming birthdays.
	 *
	 * This had an empty dependency array over the imported `birthdays` binding,
	 * so it was frozen at first render: the component re-rendered on the store
	 * signal, but this memo never recomputed, and adding someone sooner than the
	 * current third left the strip showing the previous three. `useTrackedBirthdays`
	 * is the same fix `Countdown` needed — subscribe to the recompute signal and
	 * derive during render.
	 */
	const trackedBirthdays = useTrackedBirthdays();
	const nextBirthdays = useMemo(
		() => trackedBirthdays.filter((b) => b.daysBeforeBirthday >= 0).slice(0, 3),
		[trackedBirthdays],
	);

	const tabItems: { key: TabKey; label: string; children: ReactNode }[] = [
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

	const commands: Command[] = [
		{
			id: "toggle-theme",
			label: storeSnap.darkMode
				? t("app.command.switch_light")
				: t("app.command.switch_dark"),
			hint: t("app.command.appearance"),
			keywords: "theme dark light appearance mode toggle",
			icon: storeSnap.darkMode ? <Sun size={16} /> : <Moon size={16} />,
			run: () => {
				store.darkMode = !store.darkMode;
			},
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
			forceColorScheme={storeSnap.darkMode ? "dark" : "light"}
		>
			<SkipLink />
			<Notifications position="top-right" />
			<div className="tk-shell">
				<AppHeader
					// Unfiltered on purpose: `data` only feeds `checkAndNotify`, and
					// the filtered list hides weddings (off by default) plus
					// anything the search box excluded, which would silence the
					// very birthdays the alert exists to announce.
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
