import { ConfigProvider, Modal, Tabs, theme } from "antd";
import deDE from "antd/locale/de_DE";
import enUS from "antd/locale/en_US";
import esES from "antd/locale/es_ES";
import frFR from "antd/locale/fr_FR";
import zhCN from "antd/locale/zh_CN";
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

const FONT_STACK =
	"'Geist', 'Satoshi', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const buildTheme = (dark: boolean) => ({
	algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
	token: {
		fontFamily: FONT_STACK,
		colorPrimary: dark ? "#34d399" : "#0f9d76",
		colorInfo: dark ? "#34d399" : "#0f9d76",
		colorBgBase: dark ? "#09090b" : "#f6f6f7",
		colorTextBase: dark ? "#f4f4f5" : "#18181b",
		colorBorder: dark ? "#2a2a30" : "#e4e4e7",
		colorBorderSecondary: dark ? "#1f1f24" : "#ececef",
		borderRadius: 12,
		borderRadiusLG: 18,
		controlHeight: 36,
	},
	components: {
		Table: { headerBg: "transparent" },
		Tabs: { inkBarColor: dark ? "#34d399" : "#0f9d76" },
	},
});

const StatisticsSkeleton = () => (
	<div
		className="tk-surface"
		role="status"
		aria-label="Loading insights"
		aria-busy="true"
	>
		<div
			className="tk-skeleton"
			style={{ height: 18, width: 160, marginBottom: 20 }}
		/>
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
				gap: 16,
			}}
		>
			{["a", "b", "c", "d", "e", "f"].map((id) => (
				<div
					key={id}
					className="tk-skeleton"
					style={{ height: 220, borderRadius: 18 }}
				/>
			))}
		</div>
	</div>
);

export const App = () => {
	const dataSnap = useSnapshot(dataStore);
	const storeSnap = useSnapshot(store);
	const data = dataSnap.filtered;
	const { t, i18n } = useTranslation();
	const [manageOpen, setManageOpen] = useState(false);

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

	const antdTheme = useMemo(
		() => buildTheme(storeSnap.darkMode),
		[storeSnap.darkMode],
	);

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
		<ConfigProvider locale={antdLocale} theme={antdTheme}>
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

							<Tabs defaultActiveKey="table" items={tabItems} />
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
				open={Boolean(dataSnap.selectedBirthday)}
				onCancel={() => {
					dataStore.selectedBirthday = null;
				}}
				footer={null}
				width={760}
				destroyOnClose
			>
				{dataSnap.selectedBirthday && (
					<div style={{ marginTop: 16 }}>
						<BirthdayDetails record={dataSnap.selectedBirthday} />
					</div>
				)}
			</Modal>

			<div className="tk-grain" aria-hidden="true" />
		</ConfigProvider>
	);
};
