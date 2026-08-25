import { CalendarOutlined, GithubOutlined } from "@ant-design/icons";
import { Card, ConfigProvider, Layout, Space, Typography, theme } from "antd";

const { Header, Content, Footer } = Layout;
const { Title, Paragraph, Text } = Typography;

export const App = () => {
	return (
		<ConfigProvider
			theme={{
				algorithm: theme.defaultAlgorithm,
				token: {
					colorPrimary: "#1677ff",
					borderRadius: 8,
				},
			}}
		>
			<Layout style={{ minHeight: "100vh", background: "#f5f5f5" }}>
				<Header
					style={{
						background: "#fff",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						borderBottom: "1px solid #f0f0f0",
						padding: "0 24px",
					}}
				>
					<Text strong style={{ fontSize: "1.2rem" }}>
						chneau.github.io
					</Text>
					<a
						href="https://github.com/chneau"
						target="_blank"
						rel="noreferrer"
						style={{ color: "inherit", fontSize: "1.2rem" }}
					>
						<GithubOutlined />
					</a>
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
								<Title level={2}>Welcome</Title>
								<Paragraph type="secondary">
									Personal hub and web apps by chneau
								</Paragraph>
							</div>

							<a href="/birthday/" style={{ textDecoration: "none" }}>
								<Card
									hoverable
									style={{
										transition: "all 0.3s ease",
										border: "1px solid #e8e8e8",
									}}
								>
									<Card.Meta
										avatar={<span style={{ fontSize: "2rem" }}>🎂</span>}
										title={
											<Space>
												<span>Birthday Tracker</span>
												<CalendarOutlined style={{ color: "#1677ff" }} />
											</Space>
										}
										description="Track birthdays, milestones, biorhythms, zodiac signs, and export calendar events."
									/>
								</Card>
							</a>

							<a href="/scotland-rail/" style={{ textDecoration: "none" }}>
								<Card
									hoverable
									style={{
										transition: "all 0.3s ease",
										border: "1px solid #e8e8e8",
									}}
								>
									<Card.Meta
										avatar={<span style={{ fontSize: "2rem" }}>🚆</span>}
										title={
											<Space>
												<span>A Day in Scottish Rail</span>
												<span style={{ color: "#59d7ff", fontSize: "0.85rem" }}>
													24h Replay
												</span>
											</Space>
										}
										description="Interactive 24-hour time-lapse train replay across Scotland's rail network."
									/>
								</Card>
							</a>
						</Space>
					</div>
				</Content>

				<Footer style={{ textAlign: "center", color: "#8c8c8c" }}>
					chneau © {new Date().getFullYear()}
				</Footer>
			</Layout>
		</ConfigProvider>
	);
};
