import {
	Badge,
	Box,
	Card,
	type MantineColorsTuple,
	MantineProvider,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import {
	ArrowRight,
	Beer,
	Cake,
	FileText,
	type LucideIcon,
	Rocket,
	Swords,
	TrainFront,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	AppHeader,
	Brand,
	createAppTheme,
	HeaderAction,
	SchemeToggle,
} from "../shared";

declare const BUILD_DATE: string;

type AppEntry = {
	href: string;
	icon: LucideIcon;
	title: string;
	tag: string;
	tagColor: string;
	shortcutKey: string;
	hotkey: string;
	description: string;
};

const APPS: AppEntry[] = [
	{
		href: "/cv/",
		icon: FileText,
		title: "Curriculum Vitae",
		tag: "Senior Full-Stack & Systems",
		tagColor: "purple",
		shortcutKey: "Press 1",
		hotkey: "1",
		description:
			"Senior Full-Stack & Systems Engineer — 10+ years experience across Go, TypeScript, React 19, Python, cloud infrastructure & optimization.",
	},
	{
		href: "/birthday/",
		icon: Cake,
		title: "Birthday Tracker",
		tag: "Tracker",
		tagColor: "blue",
		shortcutKey: "Press 2",
		hotkey: "2",
		description:
			"Track birthdays, milestones, biorhythms, zodiac signs, and export calendar events.",
	},
	{
		href: "/scotland-rail/",
		icon: TrainFront,
		title: "A Day in Scottish Rail",
		tag: "24h Replay",
		tagColor: "cyan",
		shortcutKey: "Press 3",
		hotkey: "3",
		description:
			"Interactive 24-hour time-lapse train replay across Scotland's rail network.",
	},
	{
		href: "/crimson-desert-save-editor/",
		icon: Swords,
		title: "Crimson Desert Save Editor",
		tag: "100% Client-Side",
		tagColor: "yellow",
		shortcutKey: "Press 4",
		hotkey: "4",
		description:
			"Edit Crimson Desert save files — inventory, gear, skills, quests and companions — entirely on your device.",
	},
	{
		href: "/spooners/",
		icon: Beer,
		title: "Spooners",
		tag: "Price map",
		tagColor: "green",
		shortcutKey: "Press 5",
		hotkey: "5",
		description:
			"See what every pub charges for the same drink or dish — searchable map, cheapest-to-dearest rankings and price distribution charts.",
	},
];

type AppItem = (typeof APPS)[number];

/** A blue accent (#1677ff), expanded to Mantine's 10-shade tuple (main shade at index 6). */
const brand: MantineColorsTuple = [
	"#e6f4ff",
	"#bae0ff",
	"#91caff",
	"#69b1ff",
	"#4096ff",
	"#1677ff",
	"#0958d9",
	"#003eb3",
	"#002c8c",
	"#001d66",
];

const appTheme = createAppTheme({
	accent: brand,
	accentName: "brand",
	primaryShade: 6,
	defaultRadius: 8,
});

/** GitHub mark, inlined so we don't depend on an icon package. */
const GithubIcon = ({ size = 18 }: { size?: number }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="currentColor"
		aria-hidden="true"
		focusable="false"
	>
		<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
	</svg>
);

const AppCard = ({ item }: { item: AppItem }) => {
	const [hovered, setHovered] = useState(false);
	const Icon = item.icon;

	return (
		<a
			href={item.href}
			style={{
				textDecoration: "none",
				display: "block",
				borderRadius: 8,
				outline: "none",
			}}
		>
			<Card
				withBorder
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				style={{
					transition:
						"transform 0.3s var(--app-ease), box-shadow 0.3s var(--app-ease), border-color 0.3s ease, background-color 0.3s ease",
					transform: hovered ? "translateY(-3px)" : "none",
					boxShadow: hovered ? "var(--app-shadow-lg)" : undefined,
					background: "var(--app-surface)",
					borderColor: hovered
						? "var(--mantine-primary-color-filled)"
						: "var(--app-border)",
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
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 40,
								height: 40,
								borderRadius: 10,
								flexShrink: 0,
								marginTop: 2,
								color: "var(--mantine-primary-color-filled)",
								background: "var(--mantine-primary-color-light)",
							}}
						>
							<Icon size={26} strokeWidth={1.5} />
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
								<Text fw={600} style={{ fontSize: "1.05rem" }}>
									{item.title}
								</Text>
								<Badge
									variant="light"
									color={item.tagColor}
									tt="none"
									fw="normal"
									style={{ margin: 0, fontSize: "0.75rem", borderRadius: 4 }}
								>
									{item.tag}
								</Badge>
							</div>
							<Text
								c="dimmed"
								style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}
							>
								{item.description}
							</Text>
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
						<ArrowRight
							size={18}
							strokeWidth={1.5}
							style={{
								color: hovered
									? "var(--mantine-primary-color-filled)"
									: "var(--app-text-faint)",
								transform: hovered ? "translateX(4px)" : "none",
								transition: "transform 0.25s var(--app-ease), color 0.25s ease",
							}}
						/>
						<Badge
							variant="light"
							color="gray"
							tt="none"
							fw="normal"
							style={{
								margin: 0,
								fontSize: "0.7rem",
								padding: "0 4px",
								lineHeight: "16px",
								opacity: 0.65,
								borderRadius: 3,
							}}
						>
							{item.shortcutKey}
						</Badge>
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

	// Global keyboard navigation: 1, 2, 3 to launch apps, T for theme
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}
			const targetApp = APPS.find((app) => app.hotkey === e.key);
			if (targetApp) {
				window.location.href = targetApp.href;
			} else if (e.key.toLowerCase() === "t") {
				setDarkMode((prev) => !prev);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<MantineProvider
			theme={appTheme}
			forceColorScheme={darkMode ? "dark" : "light"}
		>
			<Box
				style={{
					minHeight: "100vh",
					display: "flex",
					flexDirection: "column",
					background: "var(--app-bg)",
				}}
			>
				<AppHeader
					brand={
						<Brand
							href="/"
							icon={<Rocket size={18} />}
							title="chneau.github.io"
							subtitle="Personal hub and web apps"
						/>
					}
					actions={
						<>
							<SchemeToggle
								dark={darkMode}
								onToggle={() => setDarkMode((value) => !value)}
							/>
							<HeaderAction
								href="https://github.com/chneau"
								target="_blank"
								iconOnly
								label="GitHub profile"
								icon={<GithubIcon size={18} />}
							/>
						</>
					}
				/>

				<Box
					component="main"
					style={{
						flex: 1,
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						padding: "48px 24px",
					}}
				>
					<div style={{ maxWidth: 640, width: "100%" }}>
						<Stack gap="lg" style={{ width: "100%" }}>
							<div style={{ textAlign: "center" }}>
								<Title order={2}>Welcome</Title>
								<Text c="dimmed">Personal hub and web apps by chneau</Text>
							</div>

							{APPS.map((item) => (
								<AppCard key={item.href} item={item} />
							))}
						</Stack>
					</div>
				</Box>

				<Box
					component="footer"
					style={{
						textAlign: "center",
						color: "var(--app-text-muted)",
						background: "transparent",
						fontSize: "0.8rem",
						padding: "0 24px 24px",
					}}
				>
					chneau © {new Date().getFullYear()}{" "}
					<span style={{ opacity: 0.6, fontSize: "0.75rem", marginLeft: 6 }}>
						({BUILD_DATE})
					</span>
				</Box>
			</Box>
		</MantineProvider>
	);
};
