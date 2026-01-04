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
import { useMemo } from "react";
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

const getColumns = (search: string): ColumnsType<Birthday> => [
	{
		title: "Name",
		dataIndex: "name",
		render: (_, x) => (
			<>
				<Tag color={getKindColor(x.kind)}>
					<Highlight text={x.name} search={search} /> {x.kind}
				</Tag>
				{x.milestone && (
					<Tag color="gold" style={{ marginLeft: 4 }}>
						{x.milestone}
					</Tag>
				)}
			</>
		),
		sorter: (a, b) => a.name.localeCompare(b.name),
	},
	{
		title: "Birthday",
		dataIndex: "birthdayString",
		render: (_, x) => (
			<>
				📅 <Highlight text={x.birthdayString} search={search} />
			</>
		),
		sorter: (a, b) => a.birthday.getTime() - b.birthday.getTime(),
	},
	{
		title: "Age",
		dataIndex: "age",
		render: (age, x) => (
			<Highlight text={`${age} ${getAgeEmoji(age, x.kind)}`} search={search} />
		),
		sorter: (a, b) => a.age - b.age,
	},
	{
		title: "Progress",
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
		title: "In",
		dataIndex: "daysBeforeBirthday",
		render: (days) => (
			<Tag color={days === 0 ? "red" : days < 30 ? "orange" : undefined}>
				⏳ {days} days
			</Tag>
		),
		sorter: (a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday,
	},
	{
		title: "Sign",
		dataIndex: "sign",
		render: (_, x) => (
			<Tag>
				{x.signSymbol} <Highlight text={x.sign} search={search} />
			</Tag>
		),
		sorter: (a, b) => a.sign.localeCompare(b.sign),
		responsive: ["md"],
	},
	{
		title: "Birthgem",
		dataIndex: "birthgem",
		render: (_, x) => (
			<Tag color="blue">
				<Highlight text={`${x.birthgem} (${x.monthString})`} search={search} />
			</Tag>
		),
		sorter: (a, b) => a.birthgem.localeCompare(b.birthgem),
		responsive: ["lg"],
	},
	{
		title: "Chinese",
		dataIndex: "chineseZodiac",
		render: (_, x) => (
			<Tag>
				<Highlight text={x.chineseZodiac} search={search} />
			</Tag>
		),
		sorter: (a, b) => a.chineseZodiac.localeCompare(b.chineseZodiac),
		responsive: ["xl"],
	},
];

export const BirthdayTable = ({ data }: { data: readonly Birthday[] }) => {
	const dataSource = useMemo(
		() => data.map((x, i) => ({ ...x, key: i })),
		[data],
	);
	const { search } = useSnapshot(store);
	const columns = useMemo(() => getColumns(search), [search]);

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
					const sameYear = birthdays.filter(
						(b) => b.name !== record.name && b.year === record.year,
					);

					const handleDownloadCard = async () => {
						const element = document.getElementById(`card-${record.name}`);
						if (element) {
							// Temporarily show the card if it's hidden or just capture it if it's rendered off-screen
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
								message="Today's Insight"
								description={record.dailyInsight}
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
									Card
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
									href={`https://en.wikipedia.org/wiki/${record.monthString}_${record.day}`}
									target="_blank"
									rel="noreferrer"
									style={{ fontSize: "12px" }}
								>
									📅 Events
								</a>
							</Space>

							<OnThisDay month={record.month} day={record.day} />

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
									<Typography.Text strong>📈 Progress</Typography.Text>
									<ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
										<li>
											🗓️ {record.ageInDays.toLocaleString()}d /{" "}
											{record.ageInWeeks.toLocaleString()}w
										</li>
										<li>
											🗓️ {record.ageInMonths.toLocaleString()} months lived
										</li>
										<li>🌓 Half: {record.halfBirthday}</li>
										<li>
											🔢 Path {record.lifePathNumber}: {record.lifePathMeaning}
										</li>
										<li>
											{record.moonPhaseIcon} {record.moonPhase}
										</li>
									</ul>
								</div>
								<div>
									<Typography.Text strong>🎯 Milestones</Typography.Text>
									<p style={{ margin: "4px 0" }}>
										{record.milestone && (
											<span>
												{record.milestone}
												<br />
											</span>
										)}
										{record.milestoneStatus}
									</p>
									{sameBirthday.length > 0 && (
										<p style={{ margin: "4px 0" }}>
											👯 Shared: {sameBirthday.map((b) => b.name).join(", ")}
										</p>
									)}
								</div>
								<div>
									<Typography.Text strong>✨ Traits & Match</Typography.Text>
									<p style={{ margin: "4px 0" }}>{record.traits}</p>
									<div style={{ marginTop: "4px" }}>
										{record.compatible.split("&").map((el) => {
											const element = el.trim();
											return (
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
													{element}
												</Tag>
											);
										})}
									</div>
								</div>
								<div>
									<Typography.Text strong>🔢 Stats</Typography.Text>
									<ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
										<li>💓 {record.heartbeats.toLocaleString()} beats</li>
										<li>🫁 {record.breaths.toLocaleString()} breaths</li>
										<li>
											🚀 {record.distanceTraveled.toLocaleString()} km orbit
										</li>
									</ul>
								</div>
								<div>
									<Typography.Text strong>🪐 Planets</Typography.Text>
									<ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
										{record.planetAges.map((p) => (
											<li key={p.name}>
												{p.icon} {p.name}: {p.age.toFixed(1)}y
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
										Happy Birthday, {record.name}!
									</h1>
									<h2
										style={{
											opacity: 0.8,
											color: store.darkMode ? "white" : "black",
										}}
									>
										Turning {record.age + 1}
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
										🔮 {record.dailyInsight}
									</div>
									<div style={{ marginTop: "24px", fontSize: "18px" }}>
										<p>
											{record.signSymbol} {record.sign.toUpperCase()}
										</p>
										<p>💎 {record.birthgem}</p>
										<p>🐉 {record.chineseZodiac}</p>
										<p>
											{record.moonPhaseIcon} {record.moonPhase}
										</p>
										<p>🔢 Life Path {record.lifePathNumber}</p>
										<p>
											🚀 {record.distanceTraveled.toLocaleString()} km in orbit
										</p>
										<p>💓 {record.heartbeats.toLocaleString()} heartbeats</p>
									</div>
									<Divider style={{ borderColor: "rgba(128,128,128,0.3)" }} />
									<p
										style={{
											fontStyle: "italic",
											fontSize: "14px",
											opacity: 0.7,
										}}
									>
										{record.lifePathMeaning}
										<br />
										{record.traits}
									</p>
									<div
										style={{
											marginTop: "24px",
											fontSize: "12px",
											opacity: 0.5,
										}}
									>
										Birthday Tracker
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
