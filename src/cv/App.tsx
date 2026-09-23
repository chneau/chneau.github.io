import {
	EnvironmentOutlined,
	FilePdfOutlined,
	FileWordOutlined,
	GithubOutlined,
	GlobalOutlined,
	HomeOutlined,
	LinkedinOutlined,
	MailOutlined,
	MoonOutlined,
	PhoneOutlined,
	PrinterOutlined,
	SunOutlined,
} from "@ant-design/icons";
import {
	Button,
	Card,
	ConfigProvider,
	Divider,
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

const SKILLS = [
	{
		category: "Languages & Core",
		items: [
			"Go",
			"TypeScript",
			"JavaScript",
			"Rust",
			"Python",
			"C#",
			"C++",
			"SQL",
			"Bash",
		],
		color: "blue",
	},
	{
		category: "Backend & Runtimes",
		items: [
			"Go Backend",
			"Node.js",
			"Bun",
			".NET",
			"Hono",
			"Express",
			"Fastify",
			"GraphQL",
			"tRPC",
			"oRPC",
			"WebSockets",
			"WebRTC",
		],
		color: "cyan",
	},
	{
		category: "Frontend & UI",
		items: [
			"React 19",
			"Next.js",
			"Vite",
			"SolidJS",
			"Blazor",
			"Tailwind CSS",
			"Ant Design",
			"TanStack Query",
			"Wouter",
		],
		color: "geekblue",
	},
	{
		category: "Databases & Data",
		items: [
			"PostgreSQL",
			"SQLite",
			"MongoDB",
			"Redis",
			"Supabase",
			"Prisma",
			"Drizzle ORM",
			"PostGIS",
			"GIS / OSRM matrices",
		],
		color: "green",
	},
	{
		category: "Simulation & Optimization",
		items: [
			"SimPy Simulation",
			"Constraint Solving (CSP)",
			"Combinatorial Scheduling",
			"Zero-Allocation Algorithms",
		],
		color: "purple",
	},
	{
		category: "Cloud, DevOps & Infra",
		items: [
			"Docker",
			"Kubernetes",
			"GitHub Actions",
			"Terraform",
			"Linux",
			"Nginx",
			"Traefik",
			"Nomad",
			"Cloudflare",
		],
		color: "volcano",
	},
	{
		category: "AI & Developer Tooling",
		items: [
			"Claude Code",
			"Antigravity",
			"Cursor",
			"Copilot",
			"Biome",
			"uv",
			"Hyperfine",
			"Lazygit",
			"Tmux",
		],
		color: "magenta",
	},
];

export const App = () => {
	const [darkMode, setDarkMode] = useState(() => {
		const saved = localStorage.getItem("chneau_cv_theme");
		if (saved) return saved === "dark";
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	});

	useEffect(() => {
		localStorage.setItem("chneau_cv_theme", darkMode ? "dark" : "light");
		document.body.style.backgroundColor = darkMode ? "#07161e" : "#f5f7fa";
	}, [darkMode]);

	// Keyboard shortcut: Esc to return to Dashboard
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				window.location.href = "/";
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
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
				},
			}}
		>
			<style>
				{`
				@media print {
					.no-print, header.ant-layout-header, footer.ant-layout-footer {
						display: none !important;
					}
					body, .ant-layout {
						background: #ffffff !important;
						color: #000000 !important;
						padding: 0 !important;
					}
					.ant-layout-content {
						padding: 0 !important;
						max-width: 100% !important;
					}
					.ant-card {
						box-shadow: none !important;
						border: none !important;
						background: transparent !important;
					}
					.ant-card-body {
						padding: 0 !important;
					}
					a {
						text-decoration: none !important;
						color: inherit !important;
					}
				}
			`}
			</style>
			<Layout
				style={{
					minHeight: "100vh",
					background: darkMode ? "#07161e" : "#f5f7fa",
					color: darkMode ? "#d9e2e6" : "#2c3e50",
				}}
			>
				<Header
					className="no-print"
					style={{
						position: "sticky",
						top: 0,
						zIndex: 100,
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "0 24px",
						background: darkMode
							? "rgba(13, 34, 47, 0.85)"
							: "rgba(255, 255, 255, 0.85)",
						backdropFilter: "blur(12px)",
						borderBottom: `1px solid ${
							darkMode ? "rgba(217, 226, 230, 0.15)" : "#e8e8e8"
						}`,
					}}
				>
					<Space size="middle">
						<Tooltip title="Return to Dashboard (Esc)">
							<Button
								type="text"
								icon={<HomeOutlined />}
								href="/"
								style={{ fontWeight: 500 }}
							>
								Dashboard
							</Button>
						</Tooltip>
						<Text strong style={{ fontSize: 16 }}>
							Curriculum Vitae
						</Text>
					</Space>

					<Space size="small">
						<Tooltip title="Download PDF Version">
							<Button
								type="primary"
								icon={<FilePdfOutlined />}
								href="/cv.pdf"
								download="Charles_Neau_CV.pdf"
								target="_blank"
							>
								PDF
							</Button>
						</Tooltip>
						<Tooltip title="Download Word DOCX Version">
							<Button
								icon={<FileWordOutlined />}
								href="/cv.docx"
								download="Charles_Neau_CV.docx"
								target="_blank"
							>
								DOCX
							</Button>
						</Tooltip>
						<Tooltip title="Print or Save as PDF (Ctrl+P)">
							<Button
								icon={<PrinterOutlined />}
								onClick={() => window.print()}
							/>
						</Tooltip>
						<Tooltip
							title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
						>
							<Button
								type="text"
								icon={darkMode ? <SunOutlined /> : <MoonOutlined />}
								onClick={() => setDarkMode(!darkMode)}
							/>
						</Tooltip>
					</Space>
				</Header>

				<Content
					style={{
						padding: "32px 16px",
						maxWidth: 960,
						margin: "0 auto",
						width: "100%",
					}}
				>
					<Card
						bordered
						style={{
							borderRadius: 12,
							boxShadow: darkMode
								? "0 8px 32px rgba(0, 0, 0, 0.45)"
								: "0 8px 32px rgba(0, 0, 0, 0.06)",
							background: darkMode ? "#0d222f" : "#ffffff",
							borderColor: darkMode ? "rgba(217, 226, 230, 0.18)" : "#e8e8e8",
						}}
					>
						{/* Header & Contact */}
						<div style={{ textAlign: "center", marginBottom: 24 }}>
							<Title level={1} style={{ margin: "0 0 4px 0", fontSize: 32 }}>
								Charles Neau
							</Title>
							<Title
								level={3}
								style={{
									margin: "0 0 12px 0",
									color: "#1677ff",
									fontWeight: 600,
									fontSize: 18,
								}}
							>
								Senior Full-Stack & Systems Engineer
							</Title>

							<Space wrap size={[16, 8]} style={{ justifyContent: "center" }}>
								<Text type="secondary">
									<EnvironmentOutlined />{" "}
									<a
										href="https://maps.google.com/?q=Edinburgh,+UK"
										target="_blank"
										rel="noreferrer"
									>
										Edinburgh, UK
									</a>
								</Text>
								<Text type="secondary">
									<MailOutlined />{" "}
									<a href="mailto:charles63500@gmail.com">
										charles63500@gmail.com
									</a>
									<Text
										copyable={{
											text: "charles63500@gmail.com",
											tooltips: ["Copy Email", "Copied!"],
										}}
										style={{ marginLeft: 4 }}
									/>
								</Text>
								<Text type="secondary">
									<PhoneOutlined />{" "}
									<a href="tel:+447397174345">+44 7397 174345</a>
									<Text
										copyable={{
											text: "+447397174345",
											tooltips: ["Copy Phone", "Copied!"],
										}}
										style={{ marginLeft: 4 }}
									/>
								</Text>
								<Text type="secondary">
									<GlobalOutlined />{" "}
									<a
										href="https://chneau.github.io"
										target="_blank"
										rel="noreferrer"
									>
										chneau.github.io
									</a>
								</Text>
								<Text type="secondary">
									<GithubOutlined />{" "}
									<a
										href="https://github.com/chneau"
										target="_blank"
										rel="noreferrer"
									>
										github.com/chneau
									</a>
								</Text>
								<Text type="secondary">
									<LinkedinOutlined />{" "}
									<a
										href="https://linkedin.com/in/chneau"
										target="_blank"
										rel="noreferrer"
									>
										linkedin.com/in/chneau
									</a>
								</Text>
							</Space>
						</div>

						<Divider style={{ margin: "16px 0 24px 0" }} />

						{/* Professional Summary */}
						<section style={{ marginBottom: 28 }}>
							<Title
								level={4}
								style={{
									color: "#1677ff",
									marginBottom: 12,
									textTransform: "uppercase",
									letterSpacing: 0.5,
								}}
							>
								Professional Summary
							</Title>
							<Paragraph style={{ fontSize: 15, lineHeight: 1.7 }}>
								Versatile, hands-on{" "}
								<strong>Senior Full-Stack & Systems Engineer</strong> with 10+
								years of experience engineering high-performance distributed
								platforms, discrete-event simulation & logistics optimization
								engines, and full-stack cloud-native web applications. Proven
								track record leading architecture and end-to-end delivery: from
								database tuning, GIS/routing algorithms, and real-time streaming
								to modern web UIs (React 19, TypeScript, Vite), Go/Bun
								microservices, Docker/Kubernetes infrastructure, CI/CD
								automation, and AI-accelerated workflows.
							</Paragraph>
						</section>

						{/* Technical Skills */}
						<section style={{ marginBottom: 28 }}>
							<Title
								level={4}
								style={{
									color: "#1677ff",
									marginBottom: 16,
									textTransform: "uppercase",
									letterSpacing: 0.5,
								}}
							>
								Technical Expertise
							</Title>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
									gap: 14,
								}}
							>
								{SKILLS.map((grp) => (
									<div
										key={grp.category}
										style={{
											padding: "12px 14px",
											borderRadius: 8,
											background: darkMode
												? "rgba(255, 255, 255, 0.04)"
												: "#f8fafc",
											border: `1px solid ${
												darkMode ? "rgba(255, 255, 255, 0.08)" : "#edf2f7"
											}`,
										}}
									>
										<Text
											strong
											style={{
												display: "block",
												marginBottom: 8,
												fontSize: 13,
												color: darkMode ? "#93c5fd" : "#1e40af",
											}}
										>
											{grp.category}
										</Text>
										<Space size={[4, 6]} wrap style={{ width: "100%" }}>
											{grp.items.map((it) => (
												<a
													key={it}
													href={`https://github.com/chneau?tab=repositories&q=${encodeURIComponent(
														it.toLowerCase(),
													)}`}
													target="_blank"
													rel="noreferrer"
													style={{ textDecoration: "none" }}
												>
													<Tag
														color={grp.color}
														style={{
															margin: 0,
															borderRadius: 4,
															fontSize: 12,
															whiteSpace: "normal",
															wordBreak: "break-word",
															height: "auto",
															lineHeight: "18px",
															padding: "2px 7px",
															cursor: "pointer",
														}}
													>
														{it}
													</Tag>
												</a>
											))}
										</Space>
									</div>
								))}
							</div>
						</section>

						{/* Professional Experience */}
						<section style={{ marginBottom: 28 }}>
							<Title
								level={4}
								style={{
									color: "#1677ff",
									marginBottom: 16,
									textTransform: "uppercase",
									letterSpacing: 0.5,
								}}
							>
								Professional Experience
							</Title>

							{/* Celerum Ltd */}
							<div style={{ marginBottom: 24 }}>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "baseline",
										flexWrap: "wrap",
										marginBottom: 4,
									}}
								>
									<Text strong style={{ fontSize: 16 }}>
										Senior Software Engineer
									</Text>
									<Text type="secondary" style={{ fontSize: 14 }}>
										February 2017 – Present
									</Text>
								</div>
								<Text
									italic
									type="secondary"
									style={{ display: "block", marginBottom: 12 }}
								>
									Celerum Ltd — Aberdeen, UK
								</Text>
								<ul
									style={{
										paddingLeft: 20,
										margin: 0,
										lineHeight: 1.7,
										fontSize: 14.5,
									}}
								>
									<li>
										<strong>Cloud-Native Platform Architecture:</strong>{" "}
										Architected and engineered an enterprise cloud-native marine
										logistics and offshore supply vessel planning platform,
										unifying fragmented services into a modern Bun, Hono, React
										19, and TypeScript web platform with Python/SimPy simulation
										and C# optimization engines as specialized background
										workers.
									</li>
									<li>
										<strong>Optimization & Simulation Engines:</strong>{" "}
										Developed discrete-event simulation models and
										constraint-solving scheduling engines for offshore
										decommissioning, vessel sharing, and complex cargo logistics
										across North Sea operations.
									</li>
									<li>
										<strong>High-Performance Microservices & GIS:</strong>{" "}
										Implemented zero-allocation Go microservices and GIS routing
										pipelines (OSRM approximation and spatial distance matrices)
										processing large-scale geospatial and AIS (Automatic
										Identification System) vessel telemetry data.
									</li>
									<li>
										<strong>Database & Query Optimization:</strong> Architected
										multi-tenant data tiers across PostgreSQL, SQLite, MongoDB,
										and Redis; designed optimized schema migrations, spatial
										indexes, and caching strategies delivering sub-millisecond
										query latencies.
									</li>
									<li>
										<strong>Full-Stack Web Applications:</strong> Built
										responsive, reactive enterprise web portals, dashboards, and
										scheduling tools utilizing React, Vite, Ant Design, Tailwind
										CSS, and WebSockets for real-time fleet tracking.
									</li>
									<li>
										<strong>DevOps & CI/CD Infrastructure:</strong> Designed
										containerized deployment pipelines using Docker, Kubernetes,
										and GitHub Actions; established automated linting,
										testcontainers, and fast-feedback builds reducing release
										deployment cycles.
									</li>
									<li>
										<strong>Technical Mentorship & Standards:</strong> Led
										engineering best practices, code reviews, architectural
										documentation, and supervised university R&D projects and
										junior engineers.
									</li>
								</ul>
							</div>

							<Divider style={{ margin: "20px 0" }} />

							{/* RGU & ARR Craib */}
							<div>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "baseline",
										flexWrap: "wrap",
										marginBottom: 4,
									}}
								>
									<Text strong style={{ fontSize: 16 }}>
										Software Engineer (KTP Associate)
									</Text>
									<Text type="secondary" style={{ fontSize: 14 }}>
										September 2014 – February 2017
									</Text>
								</div>
								<Text
									italic
									type="secondary"
									style={{ display: "block", marginBottom: 12 }}
								>
									Robert Gordon University & ARR Craib — Aberdeen, UK
								</Text>
								<ul
									style={{
										paddingLeft: 20,
										margin: 0,
										lineHeight: 1.7,
										fontSize: 14.5,
									}}
								>
									<li>
										<strong>Fleet Management System:</strong> Designed,
										developed, and deployed an enterprise-wide real-time fleet
										logistics and dispatch management system for road haulage
										operations.
									</li>
									<li>
										<strong>Distributed Services & Scaling:</strong> Engineered
										load-balanced microservices handling high-concurrency
										vehicle telemetry, automated job scheduling, and driver
										dispatching using Meteor.js, Node.js, MongoDB, and Java.
									</li>
									<li>
										<strong>Leadership & Stakeholder Alignment:</strong> Led
										user adoption, operator training, and workflow
										digitalization across depot networks; completed professional
										management and leadership training under the UK Knowledge
										Transfer Partnership (KTP).
									</li>
								</ul>
							</div>
						</section>

						{/* Education */}
						<section style={{ marginBottom: 28 }}>
							<Title
								level={4}
								style={{
									color: "#1677ff",
									marginBottom: 16,
									textTransform: "uppercase",
									letterSpacing: 0.5,
								}}
							>
								Education
							</Title>
							<Space direction="vertical" size={12} style={{ width: "100%" }}>
								<div>
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											flexWrap: "wrap",
										}}
									>
										<Text strong>
											Bachelor of Science in Computer Science (Software
											Development for Mobile Devices)
										</Text>
										<Text type="secondary">2013 – 2014</Text>
									</div>
									<Text italic type="secondary">
										Université Blaise Pascal, Clermont-Ferrand, France
									</Text>
								</div>
								<div>
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											flexWrap: "wrap",
										}}
									>
										<Text strong>Bachelor of Science in Computer Science</Text>
										<Text type="secondary">2011 – 2013</Text>
									</div>
									<Text italic type="secondary">
										IUT Clermont-Ferrand, France
									</Text>
								</div>
							</Space>
						</section>

						{/* Publications */}
						<section>
							<Title
								level={4}
								style={{
									color: "#1677ff",
									marginBottom: 16,
									textTransform: "uppercase",
									letterSpacing: 0.5,
								}}
							>
								Peer-Reviewed Publication
							</Title>
							<div
								style={{
									padding: "14px 18px",
									borderRadius: 8,
									background: darkMode
										? "rgba(255, 255, 255, 0.04)"
										: "#f8fafc",
									border: `1px solid ${
										darkMode ? "rgba(255, 255, 255, 0.08)" : "#edf2f7"
									}`,
								}}
							>
								<Text strong style={{ fontSize: 14.5 }}>
									An Analysis of Indirect Optimisation Strategies for Scheduling
								</Text>
								<br />
								<Text type="secondary">
									Charles Neau, Olivier Regnier-Coudert, and John McCall.
								</Text>
								<br />
								<Text strong style={{ color: "#1677ff", fontSize: 13 }}>
									IEEE World Congress on Computational Intelligence (IEEE WCCI
									2018)
								</Text>
							</div>
						</section>
					</Card>
				</Content>

				<Footer
					className="no-print"
					style={{
						textAlign: "center",
						background: "transparent",
						padding: "16px 24px 32px",
						color: darkMode ? "#7a929e" : "#8c8c8c",
					}}
				>
					<Space split="•">
						<span>Charles Neau</span>
						<a href="/cv.pdf" target="_blank" rel="noreferrer">
							Download PDF
						</a>
						<a href="/cv.docx" target="_blank" rel="noreferrer">
							Download DOCX
						</a>
						<a
							href="https://github.com/chneau"
							target="_blank"
							rel="noreferrer"
						>
							GitHub
						</a>
					</Space>
					{BUILD_DATE && (
						<div style={{ marginTop: 8, fontSize: 12 }}>
							Built: {BUILD_DATE}
						</div>
					)}
				</Footer>
			</Layout>
		</ConfigProvider>
	);
};
