import {
	Alert,
	Badge,
	Button,
	Card,
	Divider,
	SimpleGrid,
	Text,
	Tooltip,
} from "@mantine/core";
import dayjs from "dayjs";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { birthdays, getAgeEmoji, getKindColor } from "./birthdays";
import { getCompatibleElements } from "./compatibility";
import { notify } from "./notify";
import { OnThisDay } from "./OnThisDay";
import { store } from "./store";

const BiorhythmsChart = lazy(() =>
	import("./BiorhythmsChart").then((m) => ({ default: m.BiorhythmsChart })),
);

type BirthdayDetailsProps = {
	record: Birthday;
};

export const BirthdayDetails = ({ record }: BirthdayDetailsProps) => {
	const { t, i18n } = useTranslation();
	const [downloading, setDownloading] = useState(false);

	const sameBirthday = birthdays.filter(
		(b) =>
			b.name !== record.name &&
			b.month === record.month &&
			b.day === record.day,
	);
	const compatibleElements = getCompatibleElements(record.element);

	const handleDownloadCard = async () => {
		const element = document.getElementById(`card-${record.name}`);
		if (!element) return;

		setDownloading(true);
		try {
			const html2canvas = (await import("html2canvas")).default;
			const canvas = await html2canvas(element, {
				backgroundColor: store.darkMode ? "#141414" : "#ffffff",
				scale: 2,
			});
			const link = document.createElement("a");
			link.download = `birthday-card-${record.name}.png`;
			link.href = canvas.toDataURL("image/png");
			link.click();
			notify.success(`Downloaded birthday card for ${record.name}! 📸`);
		} catch (e) {
			console.error("Failed to generate card", e);
			notify.error("Failed to generate birthday card");
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div style={{ padding: "8px 12px" }}>
			<Alert
				title={t("app.title")}
				icon={<span>🔮</span>}
				color="blue"
				variant="light"
				style={{ marginBottom: 12 }}
			>
				{t(`data.insights.${record.dailyInsight}`)}
			</Alert>

			<div
				style={{
					display: "flex",
					gap: 12,
					flexWrap: "wrap",
					alignItems: "center",
					marginBottom: 12,
				}}
			>
				<Button
					leftSection={<span>📸</span>}
					size="sm"
					loading={downloading}
					onClick={handleDownloadCard}
				>
					{t("app.card")}
				</Button>
				<Divider orientation="vertical" style={{ height: 20 }} />
				<a
					href={`https://en.wikipedia.org/wiki/${record.year}`}
					target="_blank"
					rel="noreferrer"
					style={{ fontSize: "13px" }}
				>
					📜 Year {record.year} on Wikipedia
				</a>
				<Divider orientation="vertical" style={{ height: 20 }} />
				<a
					href={`https://en.wikipedia.org/wiki/${dayjs(record.birthday)
						.locale("en")
						.format("MMMM")}_${record.day}`}
					target="_blank"
					rel="noreferrer"
					style={{ fontSize: "13px" }}
				>
					📅 {t("app.events")} on Wikipedia
				</a>
			</div>

			<OnThisDay month={record.month} day={record.day} />

			<div style={{ marginTop: 12, marginBottom: 16 }}>
				<Text fw={600} component="span">
					📜 {t("headers.etymology")}:
				</Text>
				<Text fs="italic" component="span">
					{record.name
						.split(" & ")
						.map((n) => {
							const key = `data.names.${n}`;
							const hasKey = i18n.exists(key);
							const ety = hasKey
								? (i18n.t as unknown as (k: string) => string)(key)
								: "";
							return ety
								? record.name.includes(" & ")
									? `${n}: ${ety}`
									: ety
								: record.name.includes(" & ")
									? n
									: t("app.no_data");
						})
						.join(" | ")}
				</Text>
			</div>

			{/* Grouped, structured information cards */}
			<SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing={12}>
				{/* Life Progress & Milestones */}
				<Card withBorder style={{ height: "100%" }}>
					<Text fw={600} style={{ marginBottom: 8 }}>
						📈 {t("headers.life_progress")}
					</Text>
					<ul
						style={{
							paddingLeft: 16,
							margin: 0,
							fontSize: "12px",
							lineHeight: "1.8",
						}}
					>
						<li>
							🗓️ {record.ageInDays.toLocaleString()} {t("units.d")} /{" "}
							{record.ageInWeeks.toLocaleString()} {t("units.w")}
						</li>
						<li>
							🗓️ {record.ageInMonths.toLocaleString()} {t("units.months_lived")}
						</li>
						<li>
							🌓 {t("units.half")}:{" "}
							{t(`data.months.${record.halfBirthdayMonth}`)}{" "}
							{record.halfBirthdayDay}
						</li>
						<li>
							{record.moonPhaseIcon} {t(`data.moon_phases.${record.moonPhase}`)}
						</li>
					</ul>
					{record.milestone && (
						<div style={{ marginTop: 8, fontSize: "12px" }}>
							<Text fw={600} component="span">
								🎯 {t("headers.milestones")}:
							</Text>
							<span>{t(record.milestone.key, record.milestone.params)}</span>
						</div>
					)}
					{sameBirthday.length > 0 && (
						<div style={{ marginTop: 4, fontSize: "12px" }}>
							<Text c="dimmed" component="span">
								👯 Shared: {sameBirthday.map((b) => b.name).join(", ")}
							</Text>
						</div>
					)}
				</Card>

				{/* Astrology & Numerology */}
				<Card withBorder style={{ height: "100%" }}>
					<Text fw={600} style={{ marginBottom: 8 }}>
						✨ {t("headers.traits_match")}
					</Text>
					<p style={{ margin: "0 0 8px 0", fontSize: "12px" }}>
						{t(`data.zodiac_traits.${record.sign}`)}
					</p>
					<div style={{ marginBottom: 8, fontSize: "12px" }}>
						<Tooltip label={t("units.path_tooltip")}>
							<span>
								<Text fw={600} component="span">
									🔢 {t("units.path")} {record.lifePathNumber}:
								</Text>
								<Text c="dimmed" component="span">
									{t(`data.life_path.${record.lifePathMeaning}`)}
								</Text>
							</span>
						</Tooltip>
					</div>
					<div>
						<Text fw={600} component="span" style={{ fontSize: "11px" }}>
							Compatible:
						</Text>
						{compatibleElements.map((element) => (
							<Badge
								key={element}
								variant="light"
								style={{
									cursor: "pointer",
									fontSize: "10px",
									padding: "0 4px",
								}}
								onClick={() => {
									store.search = element;
									window.scrollTo({ top: 0, behavior: "smooth" });
								}}
							>
								{t(`data.elements.${element}`)}
							</Badge>
						))}
					</div>
				</Card>

				{/* Cosmic & Biological Stats */}
				<Card withBorder style={{ height: "100%" }}>
					<Text fw={600} style={{ marginBottom: 8 }}>
						💓 {t("headers.stats")}
					</Text>
					<ul
						style={{
							paddingLeft: 16,
							margin: 0,
							fontSize: "12px",
							lineHeight: "1.8",
						}}
					>
						<li>
							<Tooltip label={t("units.beats_tooltip")}>
								<span>
									💓 {record.heartbeats.toLocaleString()} {t("units.beats")}
								</span>
							</Tooltip>
						</li>
						<li>
							<Tooltip label={t("units.breaths_tooltip")}>
								<span>
									🫁 {record.breaths.toLocaleString()} {t("units.breaths")}
								</span>
							</Tooltip>
						</li>
						<li>
							<Tooltip label={t("units.km_orbit_tooltip")}>
								<span>
									🚀 {record.distanceTraveled.toLocaleString()}{" "}
									{t("units.km_orbit")}
								</span>
							</Tooltip>
						</li>
					</ul>
				</Card>

				{/* Planetary Ages */}
				<Card withBorder style={{ height: "100%" }}>
					<Text fw={600} style={{ marginBottom: 8 }}>
						🪐 {t("headers.planets")}
					</Text>
					<ul
						style={{
							paddingLeft: 16,
							margin: 0,
							fontSize: "12px",
							lineHeight: "1.8",
						}}
					>
						{record.planetAges.map((p) => (
							<li key={p.name}>
								{p.icon} {t(`data.planets.${p.name}`)}: {p.age.toFixed(1)}{" "}
								{t("units.y")}
							</li>
						))}
					</ul>
				</Card>
			</SimpleGrid>

			{/* Biorhythms Visual Chart */}
			<div style={{ marginTop: 12 }}>
				<Suspense fallback={<div style={{ minHeight: 180 }} />}>
					<BiorhythmsChart birthday={record.birthday} />
				</Suspense>
			</div>

			{/* Hidden card for export capture */}
			<div
				style={{
					position: "absolute",
					left: "-9999px",
					top: "-9999px",
				}}
			>
				<div
					id={`card-${record.name}`}
					style={{
						width: "400px",
						padding: "40px",
						background: store.darkMode
							? "linear-gradient(135deg, #141414 0%, #262626 100%)"
							: "linear-gradient(135deg, #f0f2f5 0%, #ffffff 100%)",
						color: store.darkMode ? "white" : "black",
						textAlign: "center",
						borderRadius: "16px",
						border: `2px solid ${getKindColor(record.kind) || "#1890ff"}`,
					}}
				>
					<div style={{ fontSize: "48px", marginBottom: "16px" }}>
						{getAgeEmoji(record.age, record.kind)}
					</div>
					<h1
						style={{
							margin: 0,
							color: store.darkMode ? "white" : "black",
						}}
					>
						{t("app.timeline.anniversary")}, {record.name}!
					</h1>
					<h2
						style={{
							opacity: 0.8,
							color: store.darkMode ? "white" : "black",
						}}
					>
						{t("app.timeline.turns", { age: record.age + 1 })}
					</h2>
					<div
						style={{
							marginTop: "16px",
							marginBottom: "16px",
							padding: "12px",
							background: "rgba(24, 144, 255, 0.1)",
							borderRadius: "8px",
							fontSize: "14px",
						}}
					>
						🔮 {t(`data.insights.${record.dailyInsight}`)}
					</div>
					<div style={{ marginTop: "24px", fontSize: "18px" }}>
						<p>
							{record.signSymbol} {t(`data.zodiac.${record.sign}`)}
						</p>
						<p>
							💎 {t(`data.birthgems.${record.birthgem}`)} {record.birthgemEmoji}
						</p>
						<p>🐉 {t(`data.chinese_zodiac.${record.chineseZodiac}`)}</p>
						<p>
							{record.moonPhaseIcon} {t(`data.moon_phases.${record.moonPhase}`)}
						</p>
						<p>
							🔢 {t("units.path")} {record.lifePathNumber}
						</p>
						<p>
							🚀 {record.distanceTraveled.toLocaleString()}{" "}
							{t("units.km_orbit")}
						</p>
						<p>
							💓 {record.heartbeats.toLocaleString()} {t("units.beats")}
						</p>
					</div>
					<Divider style={{ borderColor: "rgba(128,128,128,0.3)" }} />
					<p
						style={{
							fontStyle: "italic",
							fontSize: "14px",
							opacity: 0.7,
						}}
					>
						{t(`data.life_path.${record.lifePathMeaning}`)}
						<br />
						{t(`data.zodiac_traits.${record.sign}`)}
					</p>
					<div
						style={{
							marginTop: "24px",
							fontSize: "12px",
							opacity: 0.5,
						}}
					>
						{t("app.title")}
					</div>
				</div>
			</div>
		</div>
	);
};
