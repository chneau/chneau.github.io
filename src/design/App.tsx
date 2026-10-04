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
} from "@mantine/core";
import {
	Check,
	Keyboard,
	Layers,
	Moon,
	Palette,
	RotateCcw,
	Ruler,
	Search,
	ShieldCheck,
	Sparkles,
	SquareStack,
	Sun,
	Type,
	Waves,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	APP_SWITCH_SHORTCUTS,
	APPS,
	AppCard,
	AppNav,
	Brand,
	type Command,
	CommandPalette,
	CommandPaletteButton,
	createAppTheme,
	EmptyState,
	Footer,
	Grain,
	HeaderAction,
	prefersReducedMotion,
	SchemeToggle,
	Section,
	ShortcutsHelpButton,
	Skeleton,
	SkipLink,
	Stat,
	StatusDot,
	useCommandPalette,
	useShortcutsHelp,
	useThemeMode,
} from "../shared";
import {
	AUDIT_SETTLE_MS,
	type Finding,
	MANTINE_ACCENT,
	runAudit,
	SITE_ACCENT,
} from "./audit";
import {
	AccentCard,
	AuditPanel,
	ColourCard,
	CopyableCode,
	FontCard,
	RadiusCard,
	SectionHeading,
	ShadowCard,
	TokenValue,
} from "./components";
import { TOKEN_DEFS, type TokenDef, useTokenSnapshot } from "./tokens";

/* ══════════════════════════════════════════════════════════════════════
   Theme
   ══════════════════════════════════════════════════════════════════════ */

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

/**
 * The gallery runs on the shared indigo ramp, at a shade chosen per scheme so
 * the *composed* system holds up rather than the ramp in isolation.
 *
 * `--app-accent` is `var(--mantine-primary-color-filled)`, so one value is
 * simultaneously the `:focus-visible` ring, `StatusDot --on`, the app-card icon
 * and arrow, and the 11.5px `.app-card__visited--new` label. Each shade has to
 * clear 3:1 against `--app-bg` and `--app-surface` (WCAG 1.4.11, non-text).
 *
 * Light takes shade 6 (`#4f46e5`): 5.7:1 on the background, 6.3:1 under the
 * white ink Mantine paints.
 *
 * Dark takes shade 5 (`#6366f1`) for the same reason. Shade 3 or 4 would give a
 * far better *ring* (9.4:1 / 6.3:1 on a card), but Mantine resolves a filled
 * button's ink in JavaScript from the **light** primary shade — see the
 * `auditButtonInk` note — so it paints white regardless. A lighter dark shade
 * therefore trades a passing ring for an unreadable button label. Shade 5 is
 * the point in this ramp where nothing is badly broken: 4.2:1 ring on a card,
 * and a white label that lands at 4.47:1.
 *
 * The remaining 0.03:1 shortfall on the filled button is a Mantine defect, not
 * a token choice, and the audit panel reports it as such rather than hiding it
 * behind a shade that would fail something worse.
 */
const appTheme = createAppTheme({
	accent: brand,
	accentName: "brand",
	primaryShade: { light: 6, dark: 5 },
	overrides: {
		/*
		 * Mantine writes `transition` *inline* for anything animated in JS
		 * (`Collapse`, which every `Section` uses, among others). An inline
		 * declaration outranks every author rule — including the global
		 * `prefers-reduced-motion` reset in `base.css` — so this flag is the
		 * only thing that can honour the preference for those components. It
		 * defaults to `false`, and the shared theme does not set it, so the
		 * gallery opts in here and the audit proves it worked.
		 */
		respectReducedMotion: true,
	},
});

/* ══════════════════════════════════════════════════════════════════════
   Presentation
   ══════════════════════════════════════════════════════════════════════ */

const byCategory = (category: TokenDef["category"]) =>
	TOKEN_DEFS.filter((token) => token.category === category);

/* ══════════════════════════════════════════════════════════════════════
   App
   ══════════════════════════════════════════════════════════════════════ */

export const App = () => {
	// The one shared theme store: persists the choice, follows the OS until the
	// visitor picks a scheme for themselves, and mirrors it onto <html> so the
	// drift check below reads the live tokens. `scheme` is always concrete,
	// never `auto`.
	const theme = useThemeMode();
	const dark = theme.dark;
	const scheme = theme.resolved;
	const [stops, setStops] = useState(24);
	const [pinned, setPinned] = useState<string[]>([]);
	const [moved, setMoved] = useState(false);
	const [findings, setFindings] = useState<readonly Finding[]>([]);
	// Findings belong to the scheme they were measured in. Clearing them up
	// front means the panel never shows light-scheme numbers labelled "dark".
	const [audited, setAudited] = useState<"light" | "dark">("light");
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();

	const { layers, live } = useTokenSnapshot(scheme);

	/*
	 * The audit runs once per scheme, and only once the document has stopped
	 * moving.
	 *
	 * The settle is load-bearing rather than cosmetic. `.app-card` transitions
	 * `background-color` over 0.3s, so reading one animation frame after the
	 * toggle catches a *mid-interpolation* backdrop — `rgb(118, 118, 120)`
	 * instead of `rgb(18, 18, 21)` — and the sweep then confidently reports
	 * near-white cards holding near-white text. Listening for the first
	 * `transitionend` is not enough either: any short transition in the page
	 * (a 150ms chevron) fires first and the sweep runs mid-fade again.
	 *
	 * `getAnimations()` is the precise instrument — it lists exactly the
	 * running transitions, so awaiting all of them means the measurement
	 * happens when the document is genuinely at rest. Infinite animations
	 * (`app-breathe`, `app-shimmer`) never finish, so they are excluded and the
	 * timer is only a backstop.
	 */
	const scheduleAudit = useCallback((next: "light" | "dark") => {
		let cancelled = false;
		let timer = 0;

		setFindings([]);
		setAudited(next);

		const finish = () => {
			if (cancelled) return;
			window.requestAnimationFrame(() => {
				if (!cancelled) setFindings(runAudit(next));
			});
		};

		// `getAnimations` is the right instrument but is not universally
		// available (happy-dom has no Web Animations model), so the settle
		// degrades to the timer rather than throwing.
		const running =
			typeof document.getAnimations === "function"
				? document
						.getAnimations()
						.filter(
							(animation): animation is CSSTransition =>
								typeof CSSTransition !== "undefined" &&
								animation instanceof CSSTransition &&
								animation.playState === "running",
						)
				: [];

		if (running.length > 0) {
			void Promise.allSettled(running.map((a) => a.finished)).then(finish);
		} else {
			window.requestAnimationFrame(finish);
		}
		timer = window.setTimeout(finish, AUDIT_SETTLE_MS);

		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, []);

	useEffect(() => scheduleAudit(scheme), [scheme, scheduleAudit]);

	// Mirror the hub's shortcuts so the hint below is honest: 1–6 switch app, T themes.
	const themeRef = useRef(theme);
	// Synced in an effect rather than during render: a render can be replayed
	// or thrown away, and a ref written mid-render can then hold a scheme that
	// never committed. Everything reading `themeRef.current` runs after commit.
	useEffect(() => {
		themeRef.current = theme;
	}, [theme]);
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
				themeRef.current.toggle();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

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
			run: () => themeRef.current.toggle(),
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
				// Hand the choice back to the operating system, instead of
				// freezing the current scheme the way the old local store did.
				themeRef.current.reset();
			},
		},
	];

	const failureCount = findings.filter(
		(finding) => finding.level === "fail",
	).length;
	// True while the sweep is pending or when these numbers belong to the other
	// scheme, so the panel can say "running" instead of showing stale rows.
	const auditPending = findings.length === 0 || audited !== scheme;

	return (
		<MantineProvider
			theme={appTheme}
			forceColorScheme={dark ? "dark" : "light"}
		>
			<SkipLink />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					minHeight: "100dvh",
					background: "var(--app-bg)",
				}}
			>
				<AppNav
					// This app binds the command palette, so the shared help dialog
					// may advertise it.
					hasCommandPalette
					icon={<Layers size={18} />}
					title="Design System"
					subtitle="Shared foundation"
					actions={<CommandPaletteButton onClick={palette.open} />}
					shortcuts={[]}
					globalShortcuts={APP_SWITCH_SHORTCUTS}
					theme={{ dark, onToggle: theme.toggle }}
				/>

				<main id="main" className="design-main">
					<Stack gap="lg">
						<div className="design-hero">
							<Title order={1}>Design System</Title>
							<Text c="var(--app-text-muted)">
								The living style guide: every value below is read back from{" "}
								<Code>tokens.css</Code> at runtime, so the gallery never drifts
								from the system it documents. Toggle the scheme to see the light
								and dark layers swap.
							</Text>
							<div className="design-kbd-row">
								<Text size="xs" c="var(--app-text-muted)">
									Switch app
								</Text>
								<kbd className="app-kbd">1</kbd>
								<Text size="xs" c="var(--app-text-muted)">
									–
								</Text>
								<kbd className="app-kbd">6</kbd>
								<Text size="xs" c="var(--app-text-muted)">
									·
								</Text>
								<Text size="xs" c="var(--app-text-muted)">
									theme
								</Text>
								<kbd className="app-kbd">T</kbd>
							</div>
						</div>

						<Section
							title="Accessibility audit"
							badge={<ShieldCheck size={14} />}
							actions={
								<Text size="xs" c="var(--app-text-muted)" aria-live="polite">
									{auditPending
										? "measuring…"
										: failureCount === 0
											? `${findings.length} checks, all passing`
											: `${failureCount} of ${findings.length} failing`}
								</Text>
							}
						>
							<SectionHeading>Accessibility audit</SectionHeading>
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
								This page checks itself. Every row below is measured from the
								live document — resolved custom properties, the outline the
								browser actually paints, and the composited backdrop behind
								every rendered string — so the panel fails on the same things a
								visitor would fail on. It re-runs when you change scheme and
								never during a render.
							</Text>
							<AuditPanel
								findings={findings}
								pending={auditPending}
								schemeWord={scheme}
							/>
						</Section>

						<Section title="Colour tokens" badge={<Palette size={14} />}>
							<SectionHeading>Colour tokens</SectionHeading>
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
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
							<Text
								size="xs"
								fw={700}
								tt="uppercase"
								c="var(--app-text-muted)"
								mt="md"
								className="design-subhead"
							>
								Accent family
							</Text>
							<Text size="xs" c="var(--app-text-muted)" mt={4} mb="xs">
								<code>--app-accent</code> is site-provided: the shared layer
								reads it with a body-text fallback in the{" "}
								<code>:focus-visible</code> ring and in{" "}
								<code>StatusDot --on</code>, so an app that forgets it loses its
								accent without a single warning. The other four are only ever
								read behind a <code>--mantine-primary-color-*</code> value, so
								they are optional.
							</Text>
							<SimpleGrid
								cols={{ base: 2, sm: 3, md: 5 }}
								spacing="sm"
								role="group"
								aria-label="Accent token swatches"
							>
								{[
									...SITE_ACCENT.map((entry) => ({
										...entry,
										label:
											entry.name === "--app-accent"
												? "Accent"
												: entry.name.replace("--app-accent-", "Accent "),
									})),
									...MANTINE_ACCENT.map((name) => ({
										name,
										required: false,
										label: name.replace("--mantine-primary-color-", "Mantine "),
									})),
								].map((entry) => (
									<AccentCard
										key={entry.name}
										name={entry.name}
										label={entry.label}
										live={live}
										required={entry.required}
									/>
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
									<div className="app-glass design-swatch--lg">
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
										className="design-swatch--lg"
										style={{
											border: "1px solid var(--app-border-strong)",
											background: "var(--app-surface)",
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
								<Text c="var(--app-text-muted)">
									Muted text for secondary detail, drawn from{" "}
									<code>--app-text-muted</code> rather than Mantine's{" "}
									<code>dimmed</code>, which lands near 3:1 on the app
									background in light.
								</Text>
								<Text c="var(--app-text-faint)">
									Faint text for tertiary detail, drawn from{" "}
									<code>--app-text-faint</code>.
								</Text>
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

						<Section title="Motion" badge={<Waves size={14} />}>
							<SectionHeading>Motion</SectionHeading>
							<Stack gap="sm">
								<Group gap="lg" align="center" wrap="wrap">
									<div className="design-track">
										<span
											aria-hidden="true"
											className={`design-thumb${
												moved ? " design-thumb--end" : ""
											}`}
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
									<Text size="xs" c="var(--app-text-muted)">
										Driven by a class, not an inline style:{" "}
										<code>shared/motion.ts</code> is explicit that an inline{" "}
										<code>transition</code> outranks the global{" "}
										<code>prefers-reduced-motion</code> reset, so a
										stylesheet-driven demo is the only honest one.
									</Text>
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
								<Divider />
								<Stack gap={6}>
									<Group justify="space-between" gap="md" wrap="wrap">
										<Text size="sm" fw={600}>
											Keyframes in the shared layer
										</Text>
										<Text size="xs" c="var(--app-text-muted)">
											{prefersReducedMotion() ? "reduced" : "full"}
										</Text>
									</Group>
									<Group gap="sm" wrap="wrap">
										<Badge variant="outline" color="brand">
											app-breathe
										</Badge>
										<Badge variant="outline" color="brand">
											app-shimmer
										</Badge>
										<Badge variant="outline" color="brand">
											app-rise
										</Badge>
									</Group>
									<div className="app-rise design-rise-demo">
										<Group gap="sm" align="center">
											<StatusDot label="Breathing" />
											<Text size="sm">
												<code>app-rise</code> on entry, <code>app-breathe</code>{" "}
												on the dot, <code>app-shimmer</code> on the skeletons
												below.
											</Text>
										</Group>
									</div>
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
									<SchemeToggle dark={dark} onToggle={theme.toggle} />
									<HeaderAction
										iconOnly
										label="Icon only"
										menuLabel="Icon only"
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
								<Text size="xs" c="var(--app-text-muted)">
									Mantine's own <code>dimmed</code> colour is not used for body
									copy here: it is <code>#868e96</code> in light, which is 3.0:1
									on the app background. Everything secondary on this page reads
									a <code>--app-text-*</code> token instead. The audit panel
									below the header is what keeps that honest.
								</Text>
							</Stack>
						</Section>

						<Section
							title="Indicators"
							badge={<Sparkles size={14} />}
							actions={
								<Text size="xs" c="var(--app-text-muted)">
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
								<Text size="xs" c="var(--app-text-muted)">
									<code>StatusDot --on</code> is{" "}
									<code>var(--app-accent, var(--app-text))</code>. With the
									token defined above it is the accent; without it it silently
									becomes the body text colour and the "online" light looks like
									ordinary text. The audit panel checks for exactly that
									collapse.
								</Text>
								<Stack gap={6}>
									<Skeleton width="60%" />
									<Skeleton width="40%" />
									<Skeleton width="80%" height={10} />
								</Stack>
								<EmptyState
									icon={<Search size={20} />}
									title="Nothing here yet"
									body="Empty states share the same mark, title, body and action. This action hands the colour scheme back to your operating system."
									action={
										<Button
											variant="default"
											size="sm"
											leftSection={<RotateCcw size={14} />}
											onClick={theme.reset}
										>
											Reset
										</Button>
									}
								/>
							</Stack>
						</Section>

						<Section title="Utilities" badge={<Ruler size={14} />}>
							<SectionHeading>Utilities</SectionHeading>
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
								The <code>app-*</code> utility classes in <code>base.css</code>{" "}
								are what the components are made of. They are part of the public
								surface, so they are shown rather than assumed.
							</Text>
							<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
								<div className="design-utility">
									<code className="app-num">.app-press</code>
									<Button
										size="compact-sm"
										className="app-press"
										variant="default"
									>
										Press me
									</Button>
								</div>
								<div className="design-utility">
									<code className="app-num">.app-surface</code>
									<div
										className="app-surface"
										style={{ padding: "8px 12px", fontSize: 12 }}
									>
										elevated panel
									</div>
								</div>
								<div className="design-utility">
									<code className="app-num">.app-kbd</code>
									<kbd className="app-kbd">⌘K</kbd>
									<kbd className="app-kbd">?</kbd>
								</div>
								<div className="design-utility">
									<code className="app-num">.app-num</code>
									<Text size="sm" className="app-num">
										1,234.56
									</Text>
								</div>
								<div className="design-utility">
									<code className="app-num">.app-scroll</code>
									<span
										style={{
											fontSize: 12,
											color: "var(--app-text-muted)",
										}}
									>
										thin, themed scrollbar
									</span>
								</div>
								<div className="design-utility app-rise">
									<code className="app-num">.app-rise</code>
									<span
										style={{
											fontSize: 12,
											color: "var(--app-text-muted)",
										}}
									>
										staggered by <code>--app-index</code>
									</span>
								</div>
							</SimpleGrid>
							<div className="design-scroll app-scroll" aria-hidden="true">
								<div className="design-scroll__inner">
									{/*
									 * Eight identical, purely decorative placeholders. The list is a
									 * literal `Array.from({length: 8})` that is never sorted, filtered
									 * or reordered, and the wrapper is aria-hidden, so there is no
									 * state for an index key to mis-associate. It is provably correct
									 * here; a generated id would imply stability it does not need.
									 *
									 * The suppression below has to stay a single line and directly
									 * above the element. Spreading the explanation over several `//`
									 * lines leaves the directive too far away for biome to attach it,
									 * and it then reports the suppression as unused while still
									 * flagging the key - which is a confusing pair of diagnostics for
									 * what is one decision.
									 */}
									{Array.from({ length: 8 }, (_, index) => {
										const width = `${60 + ((index * 7) % 35)}%`;
										return <Skeleton key={index} width={width} />;
									})}
								</div>
							</div>
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
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
								<code>AppCard</code> is the dashboard tile, reused here. Pin a
								card to see the pinned state; the whole surface stays a single
								link. Its tag badges are rendered by the shared component, so
								the audit below is measuring shared code, not this page.
							</Text>
							{/*
							 * A named <section> rather than <div role="group">: the
							 * element is a region with an accessible name, which is
							 * what the ARIA role was standing in for, and it does it
							 * with a real element instead of a role bolted onto a
							 * generic one. `role="group"` is for widget groupings,
							 * not for labelling a region of static content.
							 */}
							<section className="app-grid" aria-label="App card examples">
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
							</section>
						</Section>

						<Section title="Patterns" badge={<Sparkles size={14} />}>
							<SectionHeading>Patterns</SectionHeading>
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
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
								<Text size="sm" c="var(--app-text-muted)">
									<code>Brand</code>, <code>AppSwitcher</code>,{" "}
									<code>SkipLink</code>, <code>Grain</code> and{" "}
									<code>Footer</code> frame every page. The skip link and grain
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
								<Text size="sm" c="var(--app-text-muted)">
									<code>AppSwitcher</code> is the dropdown in the page header
									(above), so it is demonstrated live rather than duplicated
									here.
								</Text>
								<Divider />
								<Text size="sm" c="var(--app-text-muted)">
									Mantine theme layer: <code>createAppTheme</code> owns the
									neutral ramp, shadow scale, default component props and
									accents. The neutral ramp is intentionally <em>not</em>{" "}
									mirrored by <code>tokens.css</code> — they are separate
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
			</div>
			<Grain />
			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
