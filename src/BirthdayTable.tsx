import {
	Alert,
	Button,
	Divider,
	Progress,
	Space,
	Table,
	Tag,
	Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import html2canvas from "html2canvas";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { BiorhythmsChart } from "./BiorhythmsChart";
import {
	type Birthday,
	birthdays,
	getAgeEmoji,
	getKindColor,
} from "./birthdays";
import { OnThisDay } from "./OnThisDay";
import { store } from "./store";
import type { Element } from "./zodiac";

const Highlight = ({ text, search }: { text: string; search: string }) => {
	const term = search.trim();
	if (!term) return <>{text}</>;
	const escapedSearch = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = text.split(new RegExp(`(${escapedSearch})`, "gi"));
	return (
		<>
			{parts.map((part, i) =>
				part.toLowerCase() === term.toLowerCase() ? (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: fine for static text parts
						key={i}
						style={{ backgroundColor: "#ffe58f", padding: 0, color: "black" }}
					>
						{part}
					</span>
				) : (
					part
				),
			)}
		</>
	);
};

const getCompatibleElements = (element: Element): Element[] => {
	if (element === "fire" || element === "air") return ["fire", "air"];
	if (element === "earth" || element === "water") return ["earth", "water"];
	return [];
};

const getColumns = (search: string, t: TFunction): ColumnsType<Birthday> => [
	{
		title: t("table.name"),
		dataIndex: "name",
		render: (_, x) => (
			<>
				<Tag color={getKindColor(x.kind)}>
					<Highlight text={x.name} search={search} /> {x.kind}
				</Tag>
				{x.milestone && (
					<Tag color="gold" style={{ marginLeft: 4 }}>
						{t(x.milestone.key, x.milestone.params)}
					</Tag>
				)}
			</>
		),
		sorter: (a, b) => a.name.localeCompare(b.name),
	},
	{
		title: t("table.birthday"),
		dataIndex: "birthdayString",
		render: (_, x) => (
			<>
				📅 <Highlight text={x.birthdayString} search={search} />
			</>
		),
		sorter: (a, b) => a.birthday.getTime() - b.birthday.getTime(),
	},
	{
		title: t("table.age"),
		dataIndex: "age",
		render: (age, x) => (
			<Highlight text={`${age} ${getAgeEmoji(age, x.kind)}`} search={search} />
		),
		sorter: (a, b) => a.age - b.age,
	},
	{
		title: t("table.progress"),
		dataIndex: "progress",
		render: (progress) => (
			<Progress
				percent={Math.round(progress)}
				size="small"
				status={progress === 100 ? "success" : "active"}
				strokeColor={progress > 90 ? "#f5222d" : undefined}
			/>
		),
		sorter: (a, b) => a.progress - b.progress,
		responsive: ["sm"],
	},
	{
		title: t("table.in"),
		dataIndex: "daysBeforeBirthday",
		render: (days) => (
			<Tag color={days === 0 ? "red" : days < 30 ? "orange" : undefined}>
				⏳ {days} {t("table.days")}
			</Tag>
		),
		sorter: (a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday,
	},
	{
		title: t("table.sign"),
		dataIndex: "sign",
		render: (_, x) => (
			<Tag>
				{x.signSymbol}{" "}
				<Highlight text={t(`data.zodiac.${x.sign}`)} search={search} />
			</Tag>
		),
		sorter: (a, b) =>
			t(`data.zodiac.${a.sign}`).localeCompare(t(`data.zodiac.${b.sign}`)),
		responsive: ["md"],
	},
	{
		title: t("table.birthgem"),
		dataIndex: "birthgem",
		render: (_, x) => {
			const month = t(`data.months.${x.monthName}`);
			const gem = t(`data.birthgems.${x.birthgem}`);
			return (
				<Tag color="blue">
					<Highlight
						text={`${gem} ${x.birthgemEmoji} (${month})`}
						search={search}
					/>
				</Tag>
			);
		},
		sorter: (a, b) => a.birthgem.localeCompare(b.birthgem),
		responsive: ["lg"],
	},
	{
		title: t("table.chinese"),
		dataIndex: "chineseZodiac",
		render: (_, x) => (
			<Tag>
				<Highlight
					text={t(`data.chinese_zodiac.${x.chineseZodiac}`)}
					search={search}
				/>
			</Tag>
		),
		sorter: (a, b) =>
			t(`data.chinese_zodiac.${a.chineseZodiac}`).localeCompare(
				t(`data.chinese_zodiac.${b.chineseZodiac}`),
			),
		responsive: ["xl"],
	},
];

export const BirthdayTable = ({ data }: { data: readonly Birthday[] }) => {
	const dataSource = useMemo(
		() => data.map((x, i) => ({ ...x, key: i })),
		[data],
	);
	const { search } = useSnapshot(store);
	const { t } = useTranslation();
	const columns = useMemo(() => getColumns(search, t), [search, t]);

	return (
		<Table
			columns={columns}
			dataSource={dataSource}
			pagination={false}
			size="small"
			scroll={{ y: 500 }}
			rowClassName={(record) =>
				record.daysBeforeBirthday === 0 ? "birthday-today-row" : ""
			}
			expandable={{
				expandedRowRender: (record) => {
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
							<Space
								wrap
								size="small"
								separator={
									<Divider orientation="vertical" style={{ margin: "0 4px" }} />
								}
								style={{ marginBottom: 8 }}
							>
								<Button
									type="primary"
									size="small"
									onClick={handleDownloadCard}
									icon="📸"
								>
									{t("app.card")}
								</Button>
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
							</Space>

							<OnThisDay month={record.month} day={record.day} />

							<div style={{ marginTop: 8, marginBottom: 12 }}>
								<Typography.Text strong>
									📜 {t("headers.etymology")}:{" "}
								</Typography.Text>
								<Typography.Text italic>
									{record.name.includes(" & ")
										? record.name
												.split(" & ")
												.map((n) => {
													const ety = t(`data.names.${n}` as any);
													return ety !== `data.names.${n}` ? `${n}: ${ety}` : n;
												})
												.join(" | ")
										: t(`data.names.${record.name}` as any) !==
												(`data.names.${record.name}` as any)
											? t(`data.names.${record.name}` as any)
											: t("app.no_data")}
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
											🗓️ {record.ageInMonths.toLocaleString()}{" "}
											{t("units.months_lived")}
										</li>
										<li>
											🌓 {t("units.half")}:{" "}
											{t(`data.months.${record.halfBirthdayMonth}`)}{" "}
											{record.halfBirthdayDay}
										</li>
										<li>
											🔢 {t("units.path")} {record.lifePathNumber}:{" "}
											{t(`data.life_path.${record.lifePathMeaning}`)}
										</li>
										<li>
											{record.moonPhaseIcon}{" "}
											{t(`data.moon_phases.${record.moonPhase}`)}
										</li>
									</ul>
								</div>
								<div>
									<Typography.Text strong>
										🎯 {t("headers.milestones")}
									</Typography.Text>
									<p style={{ margin: "4px 0" }}>
										{record.milestone && (
											<span>
												{t(record.milestone.key, record.milestone.params)}
												<br />
											</span>
										)}
										{record.milestoneStatus &&
											t(
												record.milestoneStatus.key,
												record.milestoneStatus.params,
											)}
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
									<Typography.Text strong>
										🔢 {t("headers.stats")}
									</Typography.Text>
									<ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
										<li>
											💓 {record.heartbeats.toLocaleString()} {t("units.beats")}
										</li>
										<li>
											🫁 {record.breaths.toLocaleString()} {t("units.breaths")}
										</li>
										<li>
											🚀 {record.distanceTraveled.toLocaleString()}{" "}
											{t("units.km_orbit")}
										</li>
									</ul>
								</div>
								<div>
									<Typography.Text strong>
										🪐 {t("headers.planets")}
									</Typography.Text>
									<ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
										{record.planetAges.map((p) => (
											<li key={p.name}>
												{p.icon} {t(`data.planets.${p.name}`)}:{" "}
												{p.age.toFixed(1)}
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
										border: `2px solid ${
											getKindColor(record.kind) || "#1890ff"
										}`,
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
											💎 {t(`data.birthgems.${record.birthgem}`)}{" "}
											{record.birthgemEmoji}
										</p>
										<p>🐉 {t(`data.chinese_zodiac.${record.chineseZodiac}`)}</p>
										<p>
											{record.moonPhaseIcon}{" "}
											{t(`data.moon_phases.${record.moonPhase}`)}
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
				},
			}}
		/>
	);
};
