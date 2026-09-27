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
import { ArrowRight, Keyboard, Moon, Rocket, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
	APP_SWITCH_SHORTCUTS,
	APPS,
	type AppEntry,
	AppHeader,
	AppSwitcher,
	Brand,
	type Command,
	CommandPalette,
	CommandPaletteButton,
	createAppTheme,
	Footer,
	HeaderAction,
	SchemeToggle,
	ShortcutsHelp,
	ShortcutsHelpButton,
	SkipLink,
	useCommandPalette,
	useShortcutsHelp,
} from "../shared";

declare const BUILD_DATE: string;

type AppItem = AppEntry;

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
						<kbd
							className="app-kbd"
							title={item.shortcutKey}
							aria-label={item.shortcutKey}
						>
							{item.hotkey}
						</kbd>
					</div>
				</div>
			</Card>
		</a>
	);
};

export const App = () => {
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();
	const [darkMode, setDarkMode] = useState<boolean>(() => {
		try {
			const saved = localStorage.getItem("root_dark_mode");
			if (saved !== null) {
				return saved === "true";
			}
		} catch {
			// Ignore storage access errors (private mode, blocked cookies, etc.).
		}
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	});

	useEffect(() => {
		try {
			localStorage.setItem("root_dark_mode", String(darkMode));
		} catch {
			// Ignore storage access errors.
		}
	}, [darkMode]);

	// Global keyboard navigation: 1–6 to launch apps, T for theme
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) {
				return;
			}
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}
			if (e.target instanceof HTMLElement && e.target.isContentEditable) {
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

	const commands: Command[] = [
		{
			id: "toggle-theme",
			label: "Toggle light / dark theme",
			hint: "T",
			keywords: "theme dark light mode appearance",
			icon: darkMode ? <Sun size={16} /> : <Moon size={16} />,
			run: () => setDarkMode((value) => !value),
		},
		{
			id: "keyboard-shortcuts",
			label: "Keyboard shortcuts",
			hint: "?",
			keywords: "shortcuts keyboard keys help",
			icon: <Keyboard size={16} />,
			run: () => shortcuts.open(),
		},
	];

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
				<SkipLink />
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
							<AppSwitcher />
							<HeaderAction
								href="https://github.com/chneau"
								target="_blank"
								iconOnly
								label="GitHub profile"
								icon={<GithubIcon size={18} />}
							/>
							<ShortcutsHelpButton
								onClick={shortcuts.open}
								expanded={shortcuts.opened}
							/>
							<CommandPaletteButton onClick={palette.open} />
							<SchemeToggle
								dark={darkMode}
								onToggle={() => setDarkMode((value) => !value)}
							/>
						</>
					}
				/>

				<Box
					component="main"
					id="main"
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
								<Title order={1}>Welcome</Title>
							</div>

							{APPS.map((item) => (
								<AppCard key={item.href} item={item} />
							))}
						</Stack>
					</div>
				</Box>

				<Footer
					left={`chneau © ${new Date().getFullYear()}`}
					right={`Built ${BUILD_DATE}`}
				/>
			</Box>

			<ShortcutsHelp
				opened={shortcuts.opened}
				onClose={shortcuts.close}
				groups={[]}
				globalShortcuts={APP_SWITCH_SHORTCUTS}
			/>

			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
