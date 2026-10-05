import {
	ActionIcon,
	Badge,
	Button,
	Card,
	Code,
	Divider,
	Group,
	Loader,
	SimpleGrid,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import {
	Check,
	Layers,
	Palette,
	RotateCcw,
	Ruler,
	Search,
	ShieldCheck,
	Sparkles,
	SquareStack,
	Type,
	Waves,
	Zap,
} from "lucide-react";
import { useState } from "react";
import {
	APPS,
	AppCard,
	Brand,
	CommandPaletteButton,
	EmptyState,
	HeaderAction,
	prefersReducedMotion,
	SchemeToggle,
	Section,
	ShortcutsHelpButton,
	Skeleton,
	Stat,
	StatusDot,
} from "../shared";
import { type Finding, MANTINE_ACCENT, SITE_ACCENT } from "./audit";
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
import { TOKEN_DEFS, type TokenDef, type TokenLayers } from "./tokens";

/**
 * The gallery's sections, one component per section of the style guide.
 *
 * `App` owns what the page shares — the scheme, the audit findings, the demo
 * counters — and hands each section what it needs. A section that needs nothing
 * owns its own state: the motion demo's toggle is used by one section and one
 * section only, and lifting it into `App` was the only reason the page component
 * had to know it existed.
 */

/** The tokens of one category, in declaration order. */
const byCategory = (category: TokenDef["category"]) =>
	TOKEN_DEFS.filter((token) => token.category === category);

/** Every `--app-*` property read back from the live document. */
type LiveTokens = Record<string, string>;

export const DesignHero = () => (
	<div className="design-hero">
		<Title order={1}>Design System</Title>
		<Text c="var(--app-text-muted)">
			The living style guide: every value below is read back from{" "}
			<Code>tokens.css</Code> at runtime, so the gallery never drifts from the
			system it documents. Toggle the scheme to see the light and dark layers
			swap.
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
);

/**
 * The page auditing itself.
 *
 * `pending` covers both "the sweep is still running" and "these numbers belong
 * to the other scheme", so the badge says so rather than showing rows that no
 * longer describe what is on screen.
 */
export const AuditSection = ({
	findings,
	pending,
	scheme,
}: {
	findings: readonly Finding[];
	pending: boolean;
	scheme: "light" | "dark";
}) => {
	const failureCount = findings.filter(
		(finding) => finding.level === "fail",
	).length;

	return (
		<Section
			title="Accessibility audit"
			badge={<ShieldCheck size={14} />}
			actions={
				<Text size="xs" c="var(--app-text-muted)" aria-live="polite">
					{pending
						? "measuring…"
						: failureCount === 0
							? `${findings.length} checks, all passing`
							: `${failureCount} of ${findings.length} failing`}
				</Text>
			}
		>
			<SectionHeading>Accessibility audit</SectionHeading>
			<Text size="sm" c="var(--app-text-muted)" mb="sm">
				This page checks itself. Every row below is measured from the live
				document — resolved custom properties, the outline the browser actually
				paints, and the composited backdrop behind every rendered string — so
				the panel fails on the same things a visitor would fail on. It re-runs
				when you change scheme and never during a render.
			</Text>
			<AuditPanel findings={findings} pending={pending} schemeWord={scheme} />
		</Section>
	);
};

export const ColourTokensSection = ({
	layers,
	live,
	scheme,
}: {
	layers: TokenLayers;
	live: LiveTokens;
	scheme: "light" | "dark";
}) => (
	<Section title="Colour tokens" badge={<Palette size={14} />}>
		<SectionHeading>Colour tokens</SectionHeading>
		<Text size="sm" c="var(--app-text-muted)" mb="sm">
			Each card shows the declared light and dark values side by side. The badge
			compares the active scheme's declaration with the live computed value.
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
			<code>--app-accent</code> is site-provided: the shared layer reads it with
			a body-text fallback in the <code>:focus-visible</code> ring and in{" "}
			<code>StatusDot --on</code>, so an app that forgets it loses its accent
			without a single warning. The other four are only ever read behind a{" "}
			<code>--mantine-primary-color-*</code> value, so they are optional.
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
);

export const RadiusSection = ({ live }: { live: LiveTokens }) => (
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
);

export const ShadowSection = ({ live }: { live: LiveTokens }) => (
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
);

export const GlassSection = ({ live }: { live: LiveTokens }) => (
	<Section title="Glass & border-strong" badge={<Palette size={14} />}>
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
);

export const TypographySection = ({ live }: { live: LiveTokens }) => (
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
				<code>--app-text-muted</code> rather than Mantine's <code>dimmed</code>,
				which lands near 3:1 on the app background in light.
			</Text>
			<Text c="var(--app-text-faint)">
				Faint text for tertiary detail, drawn from <code>--app-text-faint</code>
				.
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
);

/**
 * Motion. The demo's toggle lives here because this is the only section that
 * uses it — a `moved` flag in `App` existed solely to be read down here.
 */
export const MotionSection = ({ live }: { live: LiveTokens }) => {
	const [moved, setMoved] = useState(false);

	return (
		<Section title="Motion" badge={<Waves size={14} />}>
			<SectionHeading>Motion</SectionHeading>
			<Stack gap="sm">
				<Group gap="lg" align="center" wrap="wrap">
					<div className="design-track">
						<span
							aria-hidden="true"
							className={`design-thumb${moved ? " design-thumb--end" : ""}`}
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
						<code>prefers-reduced-motion</code> reset, so a stylesheet-driven
						demo is the only honest one.
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
								<code>app-rise</code> on entry, <code>app-breathe</code> on the
								dot, <code>app-shimmer</code> on the skeletons below.
							</Text>
						</Group>
					</div>
				</Stack>
			</Stack>
		</Section>
	);
};

/**
 * Every shared control, then every Mantine one. The first group uses the live
 * handlers — palette, help, scheme — because those are the controls a visitor
 * uses to drive the page they are looking at.
 */
export const ControlsSection = ({
	dark,
	onToggleScheme,
	onOpenPalette,
	onOpenShortcuts,
}: {
	dark: boolean;
	onToggleScheme: () => void;
	onOpenPalette: () => void;
	onOpenShortcuts: () => void;
}) => (
	<Section title="Controls" badge={<SquareStack size={14} />}>
		<SectionHeading>Controls</SectionHeading>
		<Stack gap="md">
			<Group gap="sm" wrap="wrap" role="group" aria-label="Header actions">
				<CommandPaletteButton onClick={onOpenPalette} />
				<ShortcutsHelpButton onClick={onOpenShortcuts} />
				<SchemeToggle dark={dark} onToggle={onToggleScheme} />
				<HeaderAction
					iconOnly
					label="Icon only"
					menuLabel="Icon only"
					icon={<Zap size={16} />}
				/>
				<HeaderAction label="With label" icon={<Zap size={16} />}>
					Action
				</HeaderAction>
				<HeaderAction accent label="Accent action" icon={<Zap size={16} />}>
					Primary
				</HeaderAction>
				<HeaderAction active label="Active action" icon={<Zap size={16} />}>
					Active
				</HeaderAction>
				<HeaderAction disabled label="Disabled action" icon={<Zap size={16} />}>
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
			<Group gap="sm" wrap="wrap" role="group" aria-label="Mantine controls">
				<Button>Filled</Button>
				<Button variant="light">Light</Button>
				<Button variant="default">Default</Button>
				<Button variant="subtle">Subtle</Button>
				<Button variant="outline">Outline</Button>
				<ActionIcon variant="default" size={36} aria-label="Demo icon action">
					<Zap size={16} />
				</ActionIcon>
				<Badge variant="light">Badge</Badge>
				<Badge variant="outline" color="brand">
					Brand
				</Badge>
			</Group>
			<Text size="xs" c="var(--app-text-muted)">
				Mantine's own <code>dimmed</code> colour is not used for body copy here:
				it is <code>#868e96</code> in light, which is 3.0:1 on the app
				background. Everything secondary on this page reads a{" "}
				<code>--app-text-*</code> token instead. The audit panel below the
				header is what keeps that honest.
			</Text>
		</Stack>
	</Section>
);

export const IndicatorsSection = ({
	onResetScheme,
}: {
	onResetScheme: () => void;
}) => (
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
				<code>var(--app-accent, var(--app-text))</code>. With the token defined
				above it is the accent; without it it silently becomes the body text
				colour and the "online" light looks like ordinary text. The audit panel
				checks for exactly that collapse.
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
						onClick={onResetScheme}
					>
						Reset
					</Button>
				}
			/>
		</Stack>
	</Section>
);

export const UtilitiesSection = () => (
	<Section title="Utilities" badge={<Ruler size={14} />}>
		<SectionHeading>Utilities</SectionHeading>
		<Text size="sm" c="var(--app-text-muted)" mb="sm">
			The <code>app-*</code> utility classes in <code>base.css</code> are what
			the components are made of. They are part of the public surface, so they
			are shown rather than assumed.
		</Text>
		<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
			<div className="design-utility">
				<code className="app-num">.app-press</code>
				<Button size="compact-sm" className="app-press" variant="default">
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
				<span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
					thin, themed scrollbar
				</span>
			</div>
			<div className="design-utility app-rise">
				<code className="app-num">.app-rise</code>
				<span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
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
);

export const DataSection = ({
	stops,
	onToggleStops,
}: {
	stops: number;
	onToggleStops: () => void;
}) => (
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
				onClick={onToggleStops}
			/>
		</SimpleGrid>
	</Section>
);

export const AppCardsSection = ({
	pinned,
	onTogglePin,
}: {
	pinned: string[];
	onTogglePin: (href: string) => void;
}) => (
	<Section title="App cards" badge={<Layers size={14} />}>
		<SectionHeading>App cards</SectionHeading>
		<Text size="sm" c="var(--app-text-muted)" mb="sm">
			<code>AppCard</code> is the dashboard tile, reused here. Pin a card to see
			the pinned state; the whole surface stays a single link. Its tag badges
			are rendered by the shared component, so the audit below is measuring
			shared code, not this page.
		</Text>
		{/*
		 * A named <section> rather than <div role="group">: the element is a
		 * region with an accessible name, which is what the ARIA role was
		 * standing in for, and it does it with a real element instead of a role
		 * bolted onto a generic one. `role="group"` is for widget groupings,
		 * not for labelling a region of static content.
		 */}
		<section className="app-grid" aria-label="App card examples">
			{APPS.map((item, index) => (
				<AppCard
					key={item.href}
					item={item}
					index={index}
					pinned={pinned.includes(item.href)}
					lastVisitedAt={index === 0 ? Date.now() - 3_600_000 : undefined}
					onTogglePin={onTogglePin}
				/>
			))}
		</section>
	</Section>
);

export const PatternsSection = () => (
	<Section title="Patterns" badge={<Sparkles size={14} />}>
		<SectionHeading>Patterns</SectionHeading>
		<Text size="sm" c="var(--app-text-muted)" mb="sm">
			The shared loading, empty and status states compose without any extra
			styling.
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
);

export const ChromeSection = () => (
	<Section title="Chrome" badge={<Layers size={14} />}>
		<SectionHeading>Chrome</SectionHeading>
		<Stack gap="md">
			<Text size="sm" c="var(--app-text-muted)">
				<code>Brand</code>, <code>AppSwitcher</code>, <code>SkipLink</code>,{" "}
				<code>Grain</code> and <code>Footer</code> frame every page. The skip
				link and grain are always mounted at the top of this page; press Tab
				from the address bar to reveal the skip link.
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
				<code>AppSwitcher</code> is the dropdown in the page header (above), so
				it is demonstrated live rather than duplicated here.
			</Text>
			<Divider />
			<Text size="sm" c="var(--app-text-muted)">
				Mantine theme layer: <code>createAppTheme</code> owns the neutral ramp,
				shadow scale, default component props and accents. The neutral ramp is
				intentionally <em>not</em> mirrored by <code>tokens.css</code> — they
				are separate layers, as the shared token test locks in.
			</Text>
		</Stack>
	</Section>
);
