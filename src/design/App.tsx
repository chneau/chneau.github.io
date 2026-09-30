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
	Keyboard,
	Layers,
	Moon,
	Palette,
	RotateCcw,
	Search,
	Sparkles,
	SquareStack,
	Sun,
	Type,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	APP_SWITCH_SHORTCUTS,
	APPS,
	AppCard,
	AppHeader,
	AppSwitcher,
	applyColorMode,
	BackHome,
	Brand,
	type Command,
	CommandPalette,
	CommandPaletteButton,
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
	SkipLink,
	Stat,
	StatusDot,
	useCommandPalette,
	useShortcutsHelp,
} from "../shared";
import {
	TOKEN_DEFS,
	type TokenDef,
	type TokenLayers,
	useTokenSnapshot,
} from "./tokens";

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

const byCategory = (category: TokenDef["category"]) =>
	TOKEN_DEFS.filter((token) => token.category === category);

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

/** Visually hidden heading so each card still contributes to the outline. */
const SectionHeading = ({ children }: { children: string }) => (
	<Title order={2} className="sr-only">
		{children}
	</Title>
);

/** Compares the current scheme's declared value with the live computed one. */
const DriftBadge = ({
	declared,
	live,
}: {
	declared: string | undefined;
	live: string | undefined;
}) => {
	if (!declared || !live) {
		return (
			<Text size="xs" c="dimmed">
				—
			</Text>
		);
	}
	const drift = declared !== live;
	return (
		<Badge size="xs" variant="light" color={drift ? "red" : "green"}>
			{drift ? "drift" : "in sync"}
		</Badge>
	);
};

const TokenValue = ({ children }: { children: string | undefined }) => (
	<Text
		size="xs"
		c="dimmed"
		className="app-num"
		style={{ wordBreak: "break-word" }}
	>
		{children ?? "—"}
	</Text>
);

const ColourCard = ({
	token,
	layers,
	live,
	scheme,
}: {
	token: TokenDef;
	layers: TokenLayers;
	live: Record<string, string>;
	scheme: "light" | "dark";
}) => {
	const light = layers.light[token.name];
	const dark = layers.dark[token.name];
	const current = scheme === "dark" ? dark : light;

	return (
		<Card withBorder padding="xs" radius="md">
			<Group gap={4} grow>
				<div
					title={`${token.label} — light`}
					style={{
						height: 40,
						borderRadius: "var(--app-radius-xs)",
						background: light ?? `var(${token.name})`,
						border: "1px solid var(--app-border)",
					}}
				/>
				<div
					title={`${token.label} — dark`}
					style={{
						height: 40,
						borderRadius: "var(--app-radius-xs)",
						background: dark ?? `var(${token.name})`,
						border: "1px solid var(--app-border)",
					}}
				/>
			</Group>
			<Group justify="space-between" gap={6} wrap="nowrap" mt={6}>
				<Text size="xs" fw={600} truncate>
					{token.label}
				</Text>
				<DriftBadge declared={current} live={live[token.name]} />
			</Group>
			<CopyableCode value={`var(${token.name})`} label={token.label} />
			<TokenValue>{`${light ?? "—"} · ${dark ?? "—"}`}</TokenValue>
		</Card>
	);
};

const AccentCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => (
	<Card withBorder padding="xs" radius="md">
		<div
			style={{
				height: 40,
				borderRadius: "var(--app-radius-xs)",
				background: `var(${token.name})`,
				border: "1px solid var(--app-border)",
			}}
		/>
		<Text size="xs" fw={600} mt={6}>
			{token.label}
		</Text>
		<CopyableCode value={`var(${token.name})`} label={token.label} />
		<TokenValue>{live[token.name]}</TokenValue>
	</Card>
);

const RadiusCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => (
	<Card withBorder padding="xs" radius="md">
		<div
			style={{
				height: 44,
				background: "var(--app-surface-2)",
				border: "1px solid var(--app-border-strong)",
				borderRadius: `var(${token.name})`,
			}}
		/>
		<Text size="xs" fw={600} mt={6}>
			{token.label}
		</Text>
		<CopyableCode value={`var(${token.name})`} label={token.label} />
		<TokenValue>{live[token.name]}</TokenValue>
	</Card>
);

const ShadowCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => (
	<Card withBorder padding="xs" radius="md">
		<div
			style={{
				height: 44,
				borderRadius: "var(--app-radius-md)",
				background: "var(--app-surface)",
				boxShadow: `var(${token.name})`,
			}}
		/>
		<Text size="xs" fw={600} mt={6}>
			{token.label}
		</Text>
		<CopyableCode value={`var(${token.name})`} label={token.label} />
		<TokenValue>{live[token.name]}</TokenValue>
	</Card>
);

const FontCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => {
	const mono = token.name.includes("mono");
	return (
		<Card withBorder padding="sm" radius="md">
			<Text
				style={{
					fontFamily: `var(${token.name})`,
					fontSize: mono ? 14 : 18,
				}}
			>
				{mono ? "00:00 · £12.50 · 1,234" : "Grumpy wizards make toxic brew"}
			</Text>
			<Group justify="space-between" mt={6} gap={6} wrap="nowrap">
				<Text size="xs" fw={600}>
					{token.label}
				</Text>
				<CopyableCode value={`var(${token.name})`} label={token.label} />
			</Group>
			<TokenValue>{live[token.name]}</TokenValue>
		</Card>
	);
};

export const App = () => {
	const [dark, setDark] = useState(readInitialDark);
	const [stops, setStops] = useState(24);
	const [pinned, setPinned] = useState<string[]>([]);
	const [moved, setMoved] = useState(false);
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();
	const scheme: "light" | "dark" = dark ? "dark" : "light";

	useEffect(() => {
		try {
			localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
		} catch {
			// Ignore storage failures; the in-memory scheme still works.
		}
	}, [dark]);

	// Mirror the scheme onto <html> so tokens.css switches *before* the tokens
	// below are read back for the drift check.
	useEffect(() => {
		applyColorMode(scheme);
	}, [scheme]);

	const { layers, live } = useTokenSnapshot(scheme);

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

	const togglePin = (href: string) =>
		setPinned((current) =>
			current.includes(href)
				? current.filter((value) => value !== href)
				: [...current, href],
		);

	const commands: Command[] = [
		{
			id: "toggle-theme",
			label: "Toggle light / dark theme",
			hint: "T",
			keywords: "theme dark light mode appearance",
			icon: dark ? <Sun size={16} /> : <Moon size={16} />,
			run: () => setDark((value) => !value),
		},
		{
			id: "keyboard-shortcuts",
			label: "Keyboard shortcuts",
			hint: "?",
			keywords: "shortcuts keyboard keys help",
			icon: <Keyboard size={16} />,
			run: () => shortcuts.open(),
		},
		{
			id: "reset-demo-controls",
			label: "Reset demo controls",
			keywords: "reset demo controls default stops theme pins",
			icon: <RotateCcw size={16} />,
			run: () => {
				setStops(24);
				setPinned([]);
				resetScheme();
			},
		},
	];

	return (
		<MantineProvider
			theme={appTheme}
			forceColorScheme={dark ? "dark" : "light"}
		>
			<SkipLink />
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
							<CommandPaletteButton onClick={palette.open} />
							<SchemeToggle
								dark={dark}
								onToggle={() => setDark((value) => !value)}
							/>
						</>
					}
				/>

				<main
					id="main"
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
								The living style guide: every value below is read back from{" "}
								<Code>tokens.css</Code> at runtime, so the gallery never drifts
								from the system it documents. Toggle the scheme to see the light
								and dark layers swap.
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
							<SectionHeading>Colour tokens</SectionHeading>
							<Text size="sm" c="dimmed" mb="sm">
								Each card shows the declared light and dark values side by side.
								The badge compares the active scheme's declaration with the live
								computed value.
							</Text>
							<SimpleGrid
								cols={{ base: 2, sm: 3, md: 4 }}
								spacing="sm"
								role="group"
								aria-label="Colour token swatches"
							>
								{byCategory("colour").map((token) => (
									<ColourCard
										key={token.name}
										token={token}
										layers={layers}
										live={live}
										scheme={scheme}
									/>
								))}
							</SimpleGrid>
							<Text size="xs" fw={700} tt="uppercase" c="dimmed" mt="md">
								Accent (provided by Mantine / the app theme)
							</Text>
							<SimpleGrid
								cols={{ base: 2, sm: 4 }}
								spacing="sm"
								mt="xs"
								role="group"
								aria-label="Accent token swatches"
							>
								{byCategory("accent").map((token) => (
									<AccentCard key={token.name} token={token} live={live} />
								))}
							</SimpleGrid>
						</Section>

						<Section title="Radii" badge={<SquareStack size={14} />}>
							<SectionHeading>Radii</SectionHeading>
							<SimpleGrid
								cols={{ base: 2, sm: 3, md: 5 }}
								spacing="sm"
								role="group"
								aria-label="Radius tokens"
							>
								{byCategory("radius").map((token) => (
									<RadiusCard key={token.name} token={token} live={live} />
								))}
							</SimpleGrid>
						</Section>

						<Section title="Shadows" badge={<Sparkles size={14} />}>
							<SectionHeading>Shadows</SectionHeading>
							<SimpleGrid
								cols={{ base: 1, sm: 3 }}
								spacing="md"
								role="group"
								aria-label="Shadow tokens"
							>
								{byCategory("shadow").map((token) => (
									<ShadowCard key={token.name} token={token} live={live} />
								))}
							</SimpleGrid>
						</Section>

						<Section
							title="Glass & border-strong"
							badge={<Palette size={14} />}
						>
							<SectionHeading>Glass and border-strong</SectionHeading>
							<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
								<Card withBorder padding="md" radius="md">
									<div
										className="app-glass"
										style={{
											height: 96,
											borderRadius: "var(--app-radius-lg)",
											display: "grid",
											placeItems: "center",
										}}
									>
										<Text size="sm">.app-glass</Text>
									</div>
									<Group justify="space-between" mt="xs" gap="xs">
										<Text size="xs" fw={600}>
											Glass panel
										</Text>
										<CopyableCode value="var(--app-glass)" label="Glass" />
									</Group>
									<TokenValue>{live["--app-glass"]}</TokenValue>
								</Card>
								<Card withBorder padding="md" radius="md">
									<div
										style={{
											height: 96,
											borderRadius: "var(--app-radius-lg)",
											border: "1px solid var(--app-border-strong)",
											background: "var(--app-surface)",
											display: "grid",
											placeItems: "center",
										}}
									>
										<Text size="sm">1px border-strong</Text>
									</div>
									<Group justify="space-between" mt="xs" gap="xs">
										<Text size="xs" fw={600}>
											Border strong
										</Text>
										<CopyableCode
											value="var(--app-border-strong)"
											label="Border strong"
										/>
									</Group>
									<TokenValue>{live["--app-border-strong"]}</TokenValue>
								</Card>
							</SimpleGrid>
						</Section>

						<Section title="Typography" badge={<Type size={14} />}>
							<SectionHeading>Typography</SectionHeading>
							<Stack gap="xs" mb="md">
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
							<SimpleGrid
								cols={{ base: 1, sm: 3 }}
								spacing="sm"
								role="group"
								aria-label="Font stacks"
							>
								{byCategory("typography").map((token) => (
									<FontCard key={token.name} token={token} live={live} />
								))}
							</SimpleGrid>
						</Section>

						<Section title="Motion" badge={<Zap size={14} />}>
							<SectionHeading>Motion</SectionHeading>
							<Stack gap="sm">
								<Group gap="lg" align="center" wrap="wrap">
									<div
										style={{
											width: 220,
											height: 44,
											display: "flex",
											alignItems: "center",
											padding: 4,
											borderRadius: "var(--app-radius-pill)",
											background: "var(--app-surface-2)",
											border: "1px solid var(--app-border)",
										}}
									>
										<span
											aria-hidden="true"
											style={{
												width: 34,
												height: 34,
												borderRadius: "var(--app-radius-pill)",
												background:
													"var(--mantine-primary-color-filled, var(--app-text))",
												transform: moved
													? "translateX(176px)"
													: "translateX(0)",
												transition:
													"transform var(--app-speed) var(--app-ease)",
											}}
										/>
									</div>
									<Button
										variant="default"
										size="sm"
										leftSection={<Zap size={14} />}
										onClick={() => setMoved((value) => !value)}
									>
										Animate
									</Button>
								</Group>
								<Stack gap={6}>
									{byCategory("motion").map((token) => (
										<Group
											key={token.name}
											justify="space-between"
											gap="md"
											wrap="wrap"
										>
											<Text size="sm" fw={600}>
												{token.label}
											</Text>
											<Group gap="sm" wrap="nowrap">
												<CopyableCode
													value={`var(${token.name})`}
													label={token.label}
												/>
												<TokenValue>{live[token.name]}</TokenValue>
											</Group>
										</Group>
									))}
								</Stack>
							</Stack>
						</Section>

						<Section title="Controls" badge={<SquareStack size={14} />}>
							<SectionHeading>Controls</SectionHeading>
							<Stack gap="md">
								<Group
									gap="sm"
									wrap="wrap"
									role="group"
									aria-label="Header actions"
								>
									<CommandPaletteButton onClick={palette.open} />
									<ShortcutsHelpButton onClick={shortcuts.open} />
									<SchemeToggle
										dark={dark}
										onToggle={() => setDark((value) => !value)}
									/>
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
								<Group
									gap="sm"
									wrap="wrap"
									role="group"
									aria-label="Mantine controls"
								>
									<Button>Filled</Button>
									<Button variant="light">Light</Button>
									<Button variant="default">Default</Button>
									<Button variant="subtle">Subtle</Button>
									<Button variant="outline">Outline</Button>
									<ActionIcon
										variant="default"
										size={36}
										aria-label="Demo icon action"
									>
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
							<SectionHeading>Indicators</SectionHeading>
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
									<Group gap="xs">
										<StatusDot label="Live data feed" />
										<Text size="sm">Labelled status</Text>
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
							<SectionHeading>Data</SectionHeading>
							<SimpleGrid
								cols={{ base: 1, sm: 3 }}
								spacing="md"
								role="group"
								aria-label="Stat blocks"
							>
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

						<Section title="App cards" badge={<Layers size={14} />}>
							<SectionHeading>App cards</SectionHeading>
							<Text size="sm" c="dimmed" mb="sm">
								<Code>AppCard</Code> is the dashboard tile, reused here. Pin a
								card to see the pinned state; the whole surface stays a single
								link.
							</Text>
							<div
								className="app-grid"
								role="group"
								aria-label="App card examples"
							>
								{APPS.map((item, index) => (
									<AppCard
										key={item.href}
										item={item}
										index={index}
										pinned={pinned.includes(item.href)}
										lastVisitedAt={
											index === 0 ? Date.now() - 3_600_000 : undefined
										}
										onTogglePin={togglePin}
									/>
								))}
							</div>
						</Section>

						<Section title="Patterns" badge={<Sparkles size={14} />}>
							<SectionHeading>Patterns</SectionHeading>
							<Text size="sm" c="dimmed" mb="sm">
								The shared loading, empty and status states compose without any
								extra styling.
							</Text>
							<Card withBorder padding="md" radius="md">
								<Group justify="space-between" mb="sm">
									<Group gap="xs">
										<StatusDot label="Syncing" />
										<Text size="sm" fw={600}>
											Syncing data
										</Text>
									</Group>
									<Badge variant="light">loading</Badge>
								</Group>
								<Stack gap={6}>
									<Skeleton width="70%" />
									<Skeleton width="90%" />
									<Skeleton width="50%" />
								</Stack>
							</Card>
							<EmptyState
								icon={<Search size={20} />}
								title="No matches"
								body="Empty-state mark, heading, body and action are shared across every app."
							/>
						</Section>

						<Section title="Chrome" badge={<Layers size={14} />}>
							<SectionHeading>Chrome</SectionHeading>
							<Stack gap="md">
								<Text size="sm" c="dimmed">
									<Code>Brand</Code>, <Code>AppSwitcher</Code>,{" "}
									<Code>SkipLink</Code>, <Code>Grain</Code> and{" "}
									<Code>Footer</Code> frame every page. The skip link and grain
									are always mounted at the top of this page; press Tab from the
									address bar to reveal the skip link.
								</Text>
								<Group gap="lg" align="center" wrap="wrap">
									<Brand
										href="/"
										icon={<Layers size={18} />}
										title="Brand with icon"
										subtitle="and subtitle"
									/>
									<Brand title="Brand only" />
								</Group>
								<Text size="sm" c="dimmed">
									<Code>AppSwitcher</Code> is the dropdown in the page header
									(above), so it is demonstrated live rather than duplicated
									here.
								</Text>
								<Divider />
								<Text size="sm" c="dimmed">
									Mantine theme layer: <Code>createAppTheme</Code> owns the
									neutral ramp, shadow scale, default component props and
									accents. The neutral ramp is intentionally <em>not</em>{" "}
									mirrored by <Code>tokens.css</Code> — they are separate
									layers, as the shared token test locks in.
								</Text>
							</Stack>
						</Section>
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
			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
