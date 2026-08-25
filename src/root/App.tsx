import { CalendarOutlined, GithubOutlined } from "@ant-design/icons";
import {
	Button,
	Card,
	ConfigProvider,
	Layout,
	Space,
	Typography,
	theme,
} from "antd";
import { useEffect, useState } from "react";

const { Header, Content, Footer } = Layout;
const { Title, Paragraph, Text } = Typography;

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
						<Button
							size="small"
							onClick={() => setDarkMode(!darkMode)}
							style={{
								background: darkMode
									? "rgba(255, 255, 255, 0.08)"
									: "rgba(0, 0, 0, 0.04)",
								borderColor: darkMode ? "rgba(217, 226, 230, 0.25)" : "#d9d9d9",
								color: darkMode ? "#edf3f5" : "inherit",
							}}
							aria-label={
								darkMode ? "Switch to light mode" : "Switch to dark mode"
							}
						>
							{darkMode ? "☀️ Light" : "🌙 Dark"}
						</Button>
						<a
							href="https://github.com/chneau"
							target="_blank"
							rel="noreferrer"
							style={{
								color: darkMode ? "#edf3f5" : "inherit",
								fontSize: "1.2rem",
								display: "flex",
								alignItems: "center",
							}}
						>
							<GithubOutlined />
						</a>
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

							<a href="/birthday/" style={{ textDecoration: "none" }}>
								<Card
									hoverable
									style={{
										transition: "all 0.3s ease",
										background: darkMode ? "#0d222f" : "#fff",
										border: darkMode
											? "1px solid rgba(217, 226, 230, 0.2)"
											: "1px solid #e8e8e8",
									}}
								>
									<Card.Meta
										avatar={<span style={{ fontSize: "2rem" }}>🎂</span>}
										title={
											<Space>
												<span
													style={{
														color: darkMode ? "#edf3f5" : "inherit",
													}}
												>
													Birthday Tracker
												</span>
												<CalendarOutlined style={{ color: "#1677ff" }} />
											</Space>
										}
										description={
											<span
												style={{
													color: darkMode ? "#8ca0aa" : undefined,
												}}
											>
												Track birthdays, milestones, biorhythms, zodiac signs,
												and export calendar events.
											</span>
										}
									/>
								</Card>
							</a>

							<a href="/scotland-rail/" style={{ textDecoration: "none" }}>
								<Card
									hoverable
									style={{
										transition: "all 0.3s ease",
										background: darkMode ? "#0d222f" : "#fff",
										border: darkMode
											? "1px solid rgba(217, 226, 230, 0.2)"
											: "1px solid #e8e8e8",
									}}
								>
									<Card.Meta
										avatar={<span style={{ fontSize: "2rem" }}>🚆</span>}
										title={
											<Space>
												<span
													style={{
														color: darkMode ? "#edf3f5" : "inherit",
													}}
												>
													A Day in Scottish Rail
												</span>
												<span
													style={{
														color: "#59d7ff",
														fontSize: "0.85rem",
													}}
												>
													24h Replay
												</span>
											</Space>
										}
										description={
											<span
												style={{
													color: darkMode ? "#8ca0aa" : undefined,
												}}
											>
												Interactive 24-hour time-lapse train replay across
												Scotland's rail network.
											</span>
										}
									/>
								</Card>
							</a>
						</Space>
					</div>
				</Content>

				<Footer
					style={{
						textAlign: "center",
						color: darkMode ? "#8ca0aa" : "#8c8c8c",
						background: "transparent",
					}}
				>
					chneau © {new Date().getFullYear()}
				</Footer>
			</Layout>
		</ConfigProvider>
	);
};
