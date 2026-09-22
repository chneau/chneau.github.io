import { ArrowRightOutlined, GithubOutlined } from "@ant-design/icons";
import {
	Button,
	Card,
	ConfigProvider,
	Layout,
	Space,
	Tag,
	Tooltip,
	Typography,
	theme,
} from "antd";
import { useEffect, useState } from "react";

const { Header, Content, Footer } = Layout;
const { Title, Paragraph, Text } = Typography;

declare const BUILD_DATE: string;

const AppCard = ({
	href,
	emoji,
	title,
	tag,
	tagColor,
	shortcutKey,
	description,
	darkMode,
}: {
	href: string;
	emoji: string;
	title: string;
	tag: string;
	tagColor: string;
	shortcutKey: string;
	description: string;
	darkMode: boolean;
}) => {
	const [hovered, setHovered] = useState(false);

	return (
		<a
			href={href}
			style={{
				textDecoration: "none",
				display: "block",
				borderRadius: 8,
				outline: "none",
			}}
		>
			<Card
				hoverable
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				style={{
					transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
					transform: hovered ? "translateY(-3px)" : "none",
					boxShadow: hovered
						? darkMode
							? "0 8px 24px rgba(0, 0, 0, 0.45)"
							: "0 8px 24px rgba(0, 0, 0, 0.08)"
						: undefined,
					background: darkMode ? "#0d222f" : "#fff",
					borderColor: hovered
						? "#1677ff"
						: darkMode
							? "rgba(217, 226, 230, 0.2)"
							: "#e8e8e8",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 16,
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "flex-start",
							gap: 16,
							flex: 1,
							minWidth: 0,
						}}
					>
						<span
							style={{
								fontSize: "2.2rem",
								lineHeight: 1,
								flexShrink: 0,
								marginTop: 2,
							}}
						>
							{emoji}
						</span>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									flexWrap: "wrap",
									marginBottom: 4,
								}}
							>
								<Text
									strong
									style={{
										fontSize: "1.05rem",
										color: darkMode ? "#edf3f5" : "inherit",
									}}
								>
									{title}
								</Text>
								<Tag
									color={tagColor}
									bordered={false}
									style={{ margin: 0, fontSize: "0.75rem", borderRadius: 4 }}
								>
									{tag}
								</Tag>
							</div>
							<Paragraph
								type="secondary"
								style={{
									margin: 0,
									color: darkMode ? "#8ca0aa" : undefined,
									fontSize: "0.9rem",
									lineHeight: 1.5,
								}}
							>
								{description}
							</Paragraph>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "flex-end",
							gap: 6,
							flexShrink: 0,
						}}
					>
						<ArrowRightOutlined
							style={{
								fontSize: "1.1rem",
								color: hovered ? "#1677ff" : darkMode ? "#8ca0aa" : "#bfbfbf",
								transform: hovered ? "translateX(4px)" : "none",
								transition: "all 0.2s ease",
							}}
						/>
						<Tag
							style={{
								margin: 0,
								fontSize: "0.7rem",
								padding: "0 4px",
								lineHeight: "16px",
								opacity: 0.65,
								borderRadius: 3,
								background: darkMode
									? "rgba(255, 255, 255, 0.08)"
									: "rgba(0, 0, 0, 0.05)",
								borderColor: "transparent",
								color: darkMode ? "#8ca0aa" : "#8c8c8c",
							}}
						>
							{shortcutKey}
						</Tag>
					</div>
				</div>
			</Card>
		</a>
	);
};

export const App = () => {
	const [darkMode, setDarkMode] = useState<boolean>(() => {
		if (typeof localStorage !== "undefined") {
			const saved = localStorage.getItem("root_dark_mode");
			if (saved !== null) {
				return saved === "true";
			}
		}
		return true; // Dark mode by default
	});

	useEffect(() => {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem("root_dark_mode", String(darkMode));
		}
	}, [darkMode]);

	// Global keyboard navigation: 1, 2, 3 to launch apps, T/D for theme
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}
			if (e.key === "1") {
				window.location.href = "/birthday/";
			} else if (e.key === "2") {
				window.location.href = "/scotland-rail/";
			} else if (e.key === "3") {
				window.location.href = "/crimson-desert-save-editor/";
			} else if (e.key.toLowerCase() === "t") {
				setDarkMode((prev) => !prev);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<ConfigProvider
			theme={{
				algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
				token: {
					colorPrimary: "#1677ff",
					borderRadius: 8,
				},
			}}
		>
			<Layout
				style={{
					minHeight: "100vh",
					background: darkMode ? "#07131b" : "#f5f5f5",
				}}
			>
				<Header
					style={{
						background: darkMode ? "#0d222f" : "#fff",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						borderBottom: darkMode
							? "1px solid rgba(217, 226, 230, 0.15)"
							: "1px solid #f0f0f0",
						padding: "0 24px",
					}}
				>
					<Text
						strong
						style={{
							fontSize: "1.2rem",
							color: darkMode ? "#edf3f5" : "inherit",
						}}
					>
						chneau.github.io
					</Text>
					<Space size="middle">
						<Tooltip
							title={
								darkMode
									? "Switch to light mode (Press T)"
									: "Switch to dark mode (Press T)"
							}
						>
							<Button
								size="small"
								onClick={() => setDarkMode(!darkMode)}
								style={{
									background: darkMode
										? "rgba(255, 255, 255, 0.08)"
										: "rgba(0, 0, 0, 0.04)",
									borderColor: darkMode
										? "rgba(217, 226, 230, 0.25)"
										: "#d9d9d9",
									color: darkMode ? "#edf3f5" : "inherit",
								}}
								aria-label={
									darkMode ? "Switch to light mode" : "Switch to dark mode"
								}
							>
								{darkMode ? "☀️ Light" : "🌙 Dark"}
							</Button>
						</Tooltip>
						<Tooltip title="GitHub Profile">
							<a
								href="https://github.com/chneau"
								target="_blank"
								rel="noreferrer"
								aria-label="GitHub Profile"
								style={{
									color: darkMode ? "#edf3f5" : "inherit",
									fontSize: "1.2rem",
									display: "flex",
									alignItems: "center",
								}}
							>
								<GithubOutlined />
							</a>
						</Tooltip>
					</Space>
				</Header>

				<Content
					style={{
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						padding: "48px 24px",
					}}
				>
					<div style={{ maxWidth: 640, width: "100%" }}>
						<Space direction="vertical" size="large" style={{ width: "100%" }}>
							<div style={{ textAlign: "center" }}>
								<Title
									level={2}
									style={{ color: darkMode ? "#edf3f5" : "inherit" }}
								>
									Welcome
								</Title>
								<Paragraph
									type="secondary"
									style={{ color: darkMode ? "#8ca0aa" : undefined }}
								>
									Personal hub and web apps by chneau
								</Paragraph>
							</div>

							<AppCard
								href="/birthday/"
								emoji="🎂"
								title="Birthday Tracker"
								tag="Tracker"
								tagColor="blue"
								shortcutKey="Press 1"
								description="Track birthdays, milestones, biorhythms, zodiac signs, and export calendar events."
								darkMode={darkMode}
							/>

							<AppCard
								href="/scotland-rail/"
								emoji="🚆"
								title="A Day in Scottish Rail"
								tag="24h Replay"
								tagColor="cyan"
								shortcutKey="Press 2"
								description="Interactive 24-hour time-lapse train replay across Scotland's rail network."
								darkMode={darkMode}
							/>

							<AppCard
								href="/crimson-desert-save-editor/"
								emoji="⚔️"
								title="Crimson Desert Save Editor"
								tag="In-browser WASM"
								tagColor="gold"
								shortcutKey="Press 3"
								description="Edit Crimson Desert save files — inventory, gear, skills, quests and companions — entirely on your device."
								darkMode={darkMode}
							/>
						</Space>
					</div>
				</Content>

				<Footer
					style={{
						textAlign: "center",
						color: darkMode ? "#8ca0aa" : "#8c8c8c",
						background: "transparent",
						fontSize: "0.8rem",
					}}
				>
					chneau © {new Date().getFullYear()}{" "}
					<span style={{ opacity: 0.6, fontSize: "0.75rem", marginLeft: 6 }}>
						({BUILD_DATE})
					</span>
				</Footer>
			</Layout>
		</ConfigProvider>
	);
};
