import {
	ActionIcon,
	Badge,
	Button,
	Card,
	Code,
	Divider,
	Group,
	Loader,
	type MantineColorsTuple,
	MantineProvider,
	SimpleGrid,
	Stack,
	Text,
	Title,
	UnstyledButton,
} from "@mantine/core";
import {
	Check,
	Layers,
	Palette,
	RotateCcw,
	Search,
	Sparkles,
	SquareStack,
	Type,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	APP_SWITCH_SHORTCUTS,
	APPS,
	AppHeader,
	AppSwitcher,
	BackHome,
	Brand,
	createAppTheme,
	EmptyState,
	Footer,
	Grain,
	HeaderAction,
	SchemeToggle,
	Section,
	ShortcutsHelp,
	ShortcutsHelpButton,
	Skeleton,
	Stat,
	StatusDot,
	useShortcutsHelp,
} from "../shared";

const brand: MantineColorsTuple = [
	"#eef2ff",
	"#e0e7ff",
	"#c7d2fe",
	"#a5b4fc",
	"#818cf8",
	"#6366f1",
	"#4f46e5",
	"#4338ca",
	"#3730a3",
	"#312e81",
];

const appTheme = createAppTheme({
	accent: brand,
	accentName: "brand",
	primaryShade: { light: 6, dark: 5 },
});

const THEME_KEY = "design_dark_mode";

const systemPrefersDark = (): boolean =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-color-scheme: dark)").matches;

const readInitialDark = (): boolean => {
	try {
		const saved = localStorage.getItem(THEME_KEY);
		if (saved !== null) return saved === "dark";
	} catch {
		// Storage can be unavailable (private mode); fall back to the system.
	}
	return systemPrefersDark();
};

type ColourToken = {
	variable: string;
	name: string;
	light: string;
	dark: string;
};

const COLORS: readonly ColourToken[] = [
	{
		variable: "--app-bg",
		name: "Background",
		light: "#f4f4f5",
		dark: "#09090b",
	},
	{
		variable: "--app-bg-deep",
		name: "Background deep",
		light: "#ececee",
		dark: "#050506",
	},
	{
		variable: "--app-surface",
		name: "Surface",
		light: "#ffffff",
		dark: "#121215",
	},
	{
		variable: "--app-surface-2",
		name: "Surface raised",
		light: "#f4f4f6",
		dark: "#17171b",
	},
	{
		variable: "--app-surface-3",
		name: "Surface sunken",
		light: "#e9e9ec",
		dark: "#1f1f24",
	},
	{
		variable: "--app-border",
		name: "Border",
		light: "rgba(24, 24, 27, 0.1)",
		dark: "rgba(255, 255, 255, 0.08)",
	},
	{ variable: "--app-text", name: "Text", light: "#18181b", dark: "#f4f4f5" },
	{
		variable: "--app-text-muted",
		name: "Text muted",
		light: "#52525b",
		dark: "#a1a1aa",
	},
	{
		variable: "--app-text-faint",
		name: "Text faint",
		light: "#71717a",
		dark: "#8a8a92",
	},
	{
		variable: "--app-danger",
		name: "Danger",
		light: "#c2443d",
		dark: "#f08a84",
	},
	{
		variable: "--app-warn",
		name: "Warning",
		light: "#b7801f",
		dark: "#e6c069",
	},
	{
		variable: "--mantine-primary-color-filled",
		name: "Accent",
		light: "#4f46e5",
		dark: "#6366f1",
	},
];

const CopyableCode = ({ value, label }: { value: string; label: string }) => {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timeout = window.setTimeout(() => setCopied(false), 1400);
		return () => window.clearTimeout(timeout);
	}, [copied]);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
		} catch {
			// Clipboard access can be denied; leave the label unchanged.
		}
	};

	return (
		<Group gap={6} wrap="nowrap" align="center">
			<UnstyledButton
				onClick={copy}
				title={`Copy ${value}`}
				aria-label={`Copy ${label} token`}
			>
				<Code>{value}</Code>
			</UnstyledButton>
			<Text span size="xs" fw={600} c="brand" aria-live="polite">
				{copied ? "Copied" : ""}
			</Text>
		</Group>
	);
};

const Swatch = ({ token }: { token: ColourToken }) => (
	<Card withBorder padding="xs" radius="md">
		<div
			style={{
				height: 44,
				borderRadius: 8,
				background: `var(${token.variable})`,
				border: "1px solid var(--app-border)",
			}}
		/>
		<Text size="xs" fw={600} mt={6}>
			{token.name}
		</Text>
		<CopyableCode value={`var(${token.variable})`} label={token.name} />
		<Text size="xs" c="dimmed" mt={2} className="app-num">
			{token.light} / {token.dark}
		</Text>
	</Card>
);

export const App = () => {
	const [dark, setDark] = useState(readInitialDark);
	const [stops, setStops] = useState(24);
	const shortcuts = useShortcutsHelp();

	useEffect(() => {
		try {
			localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
		} catch {
			// Ignore storage failures; the in-memory scheme still works.
		}
	}, [dark]);

	// Mirror the hub's shortcuts so the hint below is honest: 1–6 switch app, T themes.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement
			) {
				return;
			}
			const target = APPS.find((app) => app.hotkey === event.key);
			if (target) {
				window.location.href = target.href;
			} else if (event.key.toLowerCase() === "t") {
				setDark((value) => !value);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const resetScheme = () => {
		try {
			localStorage.removeItem(THEME_KEY);
		} catch {
			// Nothing to clear if storage is unavailable.
		}
		setDark(systemPrefersDark());
	};

	return (
		<MantineProvider
			theme={appTheme}
			forceColorScheme={dark ? "dark" : "light"}
		>
			<Stack
				gap={0}
				style={{ minHeight: "100dvh", background: "var(--app-bg)" }}
			>
				<AppHeader
					brand={
						<Brand
							href="/"
							icon={<Layers size={18} />}
							title="Design System"
							subtitle="Shared foundation"
						/>
					}
					actions={
						<>
							<AppSwitcher />
							<BackHome />
							<ShortcutsHelpButton
								onClick={shortcuts.open}
								expanded={shortcuts.opened}
							/>
							<SchemeToggle
								dark={dark}
								onToggle={() => setDark((value) => !value)}
							/>
						</>
					}
				/>

				<main
					style={{
						flex: 1,
						width: "100%",
						maxWidth: 1080,
						margin: "0 auto",
						padding: "28px 20px 64px",
					}}
				>
					<Stack gap="lg">
						<div>
							<Title order={1}>Design System</Title>
							<Text c="dimmed">
								The tokens and primitives every app shares. Change the scheme
								with the toggle in the header.
							</Text>
							<Group gap={6} mt={8} align="center" wrap="wrap">
								<Text size="xs" c="dimmed">
									Switch app
								</Text>
								<kbd className="app-kbd">1</kbd>
								<Text size="xs" c="dimmed">
									–
								</Text>
								<kbd className="app-kbd">6</kbd>
								<Text size="xs" c="dimmed">
									·
								</Text>
								<Text size="xs" c="dimmed">
									theme
								</Text>
								<kbd className="app-kbd">T</kbd>
							</Group>
						</div>

						<Section title="Colour tokens" badge={<Palette size={14} />}>
							<SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
								{COLORS.map((token) => (
									<Swatch key={token.variable} token={token} />
								))}
							</SimpleGrid>
						</Section>

						<Section title="Typography" badge={<Type size={14} />}>
							<Stack gap="xs">
								<Title order={1} component="div">
									Heading one
								</Title>
								<Title order={2} component="div">
									Heading two
								</Title>
								<Title order={3} component="div">
									Heading three
								</Title>
								<Text>Body text, the default reading size.</Text>
								<Text c="dimmed">Muted text for secondary detail.</Text>
								<Text className="app-num">00:00 · 1,234 · £12.50</Text>
							</Stack>
						</Section>

						<Section title="Controls" badge={<SquareStack size={14} />}>
							<Stack gap="md">
								<Group gap="sm" wrap="wrap">
									<HeaderAction
										iconOnly
										label="Icon only"
										icon={<Zap size={16} />}
									/>
									<HeaderAction label="With label" icon={<Zap size={16} />}>
										Action
									</HeaderAction>
									<HeaderAction
										accent
										label="Accent action"
										icon={<Zap size={16} />}
									>
										Primary
									</HeaderAction>
									<HeaderAction
										active
										label="Active action"
										icon={<Zap size={16} />}
									>
										Active
									</HeaderAction>
									<HeaderAction
										disabled
										label="Disabled action"
										icon={<Zap size={16} />}
									>
										Disabled
									</HeaderAction>
									<HeaderAction
										loading
										label="Loading action"
										icon={<Loader size={16} />}
									>
										Loading
									</HeaderAction>
								</Group>
								<Divider />
								<Group gap="sm" wrap="wrap">
									<Button>Filled</Button>
									<Button variant="light">Light</Button>
									<Button variant="default">Default</Button>
									<Button variant="subtle">Subtle</Button>
									<Button variant="outline">Outline</Button>
									<ActionIcon variant="default" size={36}>
										<Zap size={16} />
									</ActionIcon>
									<Badge variant="light">Badge</Badge>
									<Badge variant="outline" color="brand">
										Brand
									</Badge>
								</Group>
							</Stack>
						</Section>

						<Section
							title="Indicators"
							badge={<Sparkles size={14} />}
							actions={
								<Text size="xs" c="dimmed">
									status · skeleton · empty
								</Text>
							}
						>
							<Stack gap="md">
								<Group gap="lg">
									<Group gap="xs">
										<StatusDot />
										<Text size="sm">Online</Text>
									</Group>
									<Group gap="xs">
										<StatusDot on={false} />
										<Text size="sm">Offline</Text>
									</Group>
								</Group>
								<Stack gap={6}>
									<Skeleton width="60%" />
									<Skeleton width="40%" />
									<Skeleton width="80%" height={10} />
								</Stack>
								<EmptyState
									icon={<Search size={20} />}
									title="Nothing here yet"
									body="Empty states share the same mark, title, body and action. This action restores the default colour scheme."
									action={
										<Button
											variant="default"
											size="sm"
											leftSection={<RotateCcw size={14} />}
											onClick={resetScheme}
										>
											Reset
										</Button>
									}
								/>
							</Stack>
						</Section>

						<Section title="Data" badge={<SquareStack size={14} />}>
							<SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
								<Stat
									icon={<Zap size={13} />}
									label="Fastest"
									value="142 km/h"
									hint="average across the run"
								/>
								<Stat label="Longest" value="386 km" hint="end to end" />
								<Stat
									label="Most stops"
									value={stops}
									icon={stops === 31 ? <Check size={13} /> : undefined}
									hint={stops === 24 ? "click to show peak" : "click to reset"}
									onClick={() => setStops((value) => (value === 24 ? 31 : 24))}
								/>
							</SimpleGrid>
						</Section>

						<Card withBorder padding="lg" radius="md">
							<Title order={2} mb={6}>
								Chrome
							</Title>
							<Text c="dimmed" size="sm">
								Header, footer and grain are shared too. The footer is below.
							</Text>
						</Card>
					</Stack>
				</main>

				<Footer
					left="Design System · shared foundation"
					right={
						<Group gap="xs">
							<Badge variant="light" color="brand">
								primitives
							</Badge>
							<Badge variant="light">tokens</Badge>
						</Group>
					}
				/>
			</Stack>
			<Grain />
			<ShortcutsHelp
				opened={shortcuts.opened}
				onClose={shortcuts.close}
				groups={[]}
				globalShortcuts={APP_SWITCH_SHORTCUTS}
			/>
		</MantineProvider>
	);
};
