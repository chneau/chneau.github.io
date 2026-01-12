import { Alert, Button, Divider, Tag, Tooltip, Typography } from "antd";
import html2canvas from "html2canvas";
import { useTranslation } from "react-i18next";
import { BiorhythmsChart } from "../BiorhythmsChart";
import {
	type Birthday,
	birthdays,
	getAgeEmoji,
	getKindColor,
} from "../birthdays";
import { OnThisDay } from "../OnThisDay";
import { store } from "../store";
import type { Element } from "../zodiac";

type BirthdayDetailsProps = {
	record: Birthday;
};

const getCompatibleElements = (element: Element): Element[] => {
	if (element === "fire" || element === "air") return ["fire", "air"];
	if (element === "earth" || element === "water") return ["earth", "water"];
	return [];
};

export const BirthdayDetails = ({ record }: BirthdayDetailsProps) => {
	const { t } = useTranslation();
	const sameBirthday = birthdays.filter(
		(b) =>
			b.name !== record.name &&
			b.month === record.month &&
			b.day === record.day,
	);
	const compatibleElements = getCompatibleElements(record.element);

	const handleDownloadCard = async () => {
		const element = document.getElementById(`card-${record.name}`);
		if (element) {
			const canvas = await html2canvas(element, {
				backgroundColor: store.darkMode ? "#141414" : "#ffffff",
				scale: 2,
			});
			const link = document.createElement("a");
			link.download = `birthday-card-${record.name}.png`;
			link.href = canvas.toDataURL("image/png");
			link.click();
		}
	};

	return (
		<div style={{ padding: "4px 8px" }}>
			<Alert
				message={t("app.title")}
				description={t(`data.insights.${record.dailyInsight}`)}
				type="info"
				showIcon
				icon="🔮"
				style={{ marginBottom: 8 }}
			/>
			<div
				style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}
			>
				<Button
					type="primary"
					size="small"
					onClick={handleDownloadCard}
					icon="📸"
				>
					{t("app.card")}
				</Button>
				<Divider type="vertical" style={{ height: "100%" }} />
				<a
					href={`https://en.wikipedia.org/wiki/${record.year}`}
					target="_blank"
					rel="noreferrer"
					style={{ fontSize: "12px" }}
				>
					📜 {record.year}
				</a>
				<a
					href={`https://en.wikipedia.org/wiki/${t(
						`data.months.${record.monthName}`,
					)}_${record.day}`}
					target="_blank"
					rel="noreferrer"
					style={{ fontSize: "12px" }}
				>
					📅 {t("app.events")}
				</a>
			</div>

			<OnThisDay month={record.month} day={record.day} />

			<div style={{ marginTop: 8, marginBottom: 12 }}>
				<Typography.Text strong>📜 {t("headers.etymology")}:</Typography.Text>
				<Typography.Text italic>
					{(() => {
						const name = record.name;
						const tDynamic = t as (k: string) => string;
						if (name.includes(" & ")) {
							return name
								.split(" & ")
								.map((n) => {
									const key = `data.names.${n}`;
									const ety = tDynamic(key);
									return ety !== key ? `${n}: ${ety}` : n;
								})
								.join(" | ");
						}
						const key = `data.names.${name}`;
						const ety = tDynamic(key);
						return ety !== key ? ety : t("app.no_data");
					})()}
				</Typography.Text>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
					gap: "8px",
					marginTop: "8px",
					fontSize: "12px",
				}}
			>
				<div>
					<Typography.Text strong>
						📈 {t("headers.life_progress")}
					</Typography.Text>
					<ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
						<li>
							🗓️ {record.ageInDays.toLocaleString()}
							{t("units.d")} / {record.ageInWeeks.toLocaleString()}
							{t("units.w")}
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
							<Tooltip title={t("units.path_tooltip")}>
								🔢 {t("units.path")} {record.lifePathNumber}:{" "}
								{t(`data.life_path.${record.lifePathMeaning}`)}
							</Tooltip>
						</li>
						<li>
							{record.moonPhaseIcon} {t(`data.moon_phases.${record.moonPhase}`)}
						</li>
					</ul>
				</div>
				<div>
					<Typography.Text strong>🎯 {t("headers.milestones")}</Typography.Text>
					<p style={{ margin: "4px 0" }}>
						{record.milestone && (
							<span>
								{t(record.milestone.key, record.milestone.params)}
								<br />
							</span>
						)}
						{record.milestoneStatus &&
							t(record.milestoneStatus.key, record.milestoneStatus.params)}
					</p>
					{sameBirthday.length > 0 && (
						<p style={{ margin: "4px 0" }}>
							👯 Shared: {sameBirthday.map((b) => b.name).join(", ")}
						</p>
					)}
				</div>
				<div>
					<Typography.Text strong>
						✨ {t("headers.traits_match")}
					</Typography.Text>
					<p style={{ margin: "4px 0" }}>
						{t(`data.zodiac_traits.${record.sign}`)}
					</p>
					<div style={{ marginTop: "4px" }}>
						{compatibleElements.map((element) => {
							return (
								<Tag
									key={element}
									style={{
										cursor: "pointer",
										fontSize: "10px",
										padding: "0 4px",
									}}
									onClick={() => {
										store.search = element; // "fire", "air"... (keys)
										window.scrollTo({ top: 0, behavior: "smooth" });
									}}
								>
									{t(`data.elements.${element}`)}
								</Tag>
							);
						})}
					</div>
				</div>
				<div>
					<Typography.Text strong>🔢 {t("headers.stats")}</Typography.Text>
					<ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
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
				</div>
				<div>
					<Typography.Text strong>🪐 {t("headers.planets")}</Typography.Text>
					<ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
						{record.planetAges.map((p) => (
							<li key={p.name}>
								{p.icon} {t(`data.planets.${p.name}`)}: {p.age.toFixed(1)}
								{t("units.y")}
							</li>
						))}
					</ul>
				</div>
			</div>

			<div style={{ marginTop: 8 }}>
				<BiorhythmsChart birthday={record.birthday} />
			</div>

			{/* Hidden card for capture */}
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
