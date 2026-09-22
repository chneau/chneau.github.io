import {
	Alert,
	Button,
	Card,
	Col,
	Divider,
	message,
	Row,
	Tag,
	Tooltip,
	Typography,
} from "antd";
import dayjs from "dayjs";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Element } from "./birthdays";
import {
	type Birthday,
	birthdays,
	getAgeEmoji,
	getKindColor,
} from "./birthdays";
import { OnThisDay } from "./OnThisDay";
import { store } from "./store";

const BiorhythmsChart = lazy(() =>
	import("./BiorhythmsChart").then((m) => ({ default: m.BiorhythmsChart })),
);

type BirthdayDetailsProps = {
	record: Birthday;
};

const getCompatibleElements = (element: Element): Element[] => {
	if (element === "fire" || element === "air") return ["fire", "air"];
	if (element === "earth" || element === "water") return ["earth", "water"];
	return [];
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
			message.success(`Downloaded birthday card for ${record.name}! 📸`);
		} catch (e) {
			console.error("Failed to generate card", e);
			message.error("Failed to generate birthday card");
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div style={{ padding: "8px 12px" }}>
			<Alert
				message={t("app.title")}
				description={t(`data.insights.${record.dailyInsight}`)}
				type="info"
				showIcon
				icon="🔮"
				style={{ marginBottom: 12 }}
			/>

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
					type="primary"
					size="small"
					loading={downloading}
					onClick={handleDownloadCard}
					icon="📸"
				>
					{t("app.card")}
				</Button>
				<Divider type="vertical" />
				<a
					href={`https://en.wikipedia.org/wiki/${record.year}`}
					target="_blank"
					rel="noreferrer"
					style={{ fontSize: "13px" }}
				>
					📜 Year {record.year} on Wikipedia
				</a>
				<Divider type="vertical" />
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
				<Typography.Text strong>📜 {t("headers.etymology")}:</Typography.Text>
				<Typography.Text italic>
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
				</Typography.Text>
			</div>

			{/* Grouped, structured information cards */}
			<Row gutter={[12, 12]}>
				{/* Life Progress & Milestones */}
				<Col xs={24} sm={12} md={6}>
					<Card
						size="small"
						title={<span>📈 {t("headers.life_progress")}</span>}
						style={{ height: "100%" }}
					>
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
								🗓️ {record.ageInMonths.toLocaleString()}{" "}
								{t("units.months_lived")}
							</li>
							<li>
								🌓 {t("units.half")}:{" "}
								{t(`data.months.${record.halfBirthdayMonth}`)}{" "}
								{record.halfBirthdayDay}
							</li>
							<li>
								{record.moonPhaseIcon}{" "}
								{t(`data.moon_phases.${record.moonPhase}`)}
							</li>
						</ul>
						{record.milestone && (
							<div style={{ marginTop: 8, fontSize: "12px" }}>
								<Typography.Text strong>
									🎯 {t("headers.milestones")}:
								</Typography.Text>
								<span>{t(record.milestone.key, record.milestone.params)}</span>
							</div>
						)}
						{sameBirthday.length > 0 && (
							<div style={{ marginTop: 4, fontSize: "12px" }}>
								<Typography.Text type="secondary">
									👯 Shared: {sameBirthday.map((b) => b.name).join(", ")}
								</Typography.Text>
							</div>
						)}
					</Card>
				</Col>

				{/* Astrology & Numerology */}
				<Col xs={24} sm={12} md={6}>
					<Card
						size="small"
						title={<span>✨ {t("headers.traits_match")}</span>}
						style={{ height: "100%" }}
					>
						<p style={{ margin: "0 0 8px 0", fontSize: "12px" }}>
							{t(`data.zodiac_traits.${record.sign}`)}
						</p>
						<div style={{ marginBottom: 8, fontSize: "12px" }}>
							<Tooltip title={t("units.path_tooltip")}>
								<Typography.Text strong>
									🔢 {t("units.path")} {record.lifePathNumber}:
								</Typography.Text>
								<Typography.Text type="secondary">
									{t(`data.life_path.${record.lifePathMeaning}`)}
								</Typography.Text>
							</Tooltip>
						</div>
						<div>
							<Typography.Text strong style={{ fontSize: "11px" }}>
								Compatible:
							</Typography.Text>
							{compatibleElements.map((element) => (
								<Tag
									key={element}
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
								</Tag>
							))}
						</div>
					</Card>
				</Col>

				{/* Cosmic & Biological Stats */}
				<Col xs={24} sm={12} md={6}>
					<Card
						size="small"
						title={<span>💓 {t("headers.stats")}</span>}
						style={{ height: "100%" }}
					>
						<ul
							style={{
								paddingLeft: 16,
								margin: 0,
								fontSize: "12px",
								lineHeight: "1.8",
							}}
						>
							<li>
								<Tooltip title={t("units.beats_tooltip")}>
									💓 {record.heartbeats.toLocaleString()} {t("units.beats")}
								</Tooltip>
							</li>
							<li>
								<Tooltip title={t("units.breaths_tooltip")}>
									🫁 {record.breaths.toLocaleString()} {t("units.breaths")}
								</Tooltip>
							</li>
							<li>
								<Tooltip title={t("units.km_orbit_tooltip")}>
									🚀 {record.distanceTraveled.toLocaleString()}{" "}
									{t("units.km_orbit")}
								</Tooltip>
							</li>
						</ul>
					</Card>
				</Col>

				{/* Planetary Ages */}
				<Col xs={24} sm={12} md={6}>
					<Card
						size="small"
						title={<span>🪐 {t("headers.planets")}</span>}
						style={{ height: "100%" }}
					>
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
				</Col>
			</Row>

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
