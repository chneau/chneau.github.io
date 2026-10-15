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
import { Fragment, type ReactNode, useState } from "react";
import {
	APPS,
	AppCard,
	Brand,
	CommandPaletteButton,
	EmptyState,
	ErrorState,
	HeaderAction,
	LoadingState,
	prefersReducedMotion,
	SchemeToggle,
	ShortcutsHelpButton,
	Skeleton,
	Stat,
	StatusDot,
} from "../shared";
import type { Finding } from "./audit";
import {
	AccentCard,
	AuditPanel,
	ColourCard,
	CopyableCode,
	FontCard,
	GallerySection,
	RadiusCard,
	ShadowCard,
	TokenValue,
} from "./components";
import {
	ACCENT_TOKENS,
	TOKEN_DEFS,
	type TokenDef,
	type TokenLayers,
	useSharedStyles,
} from "./tokens";

const byCategory = (category: TokenDef["category"]) =>
	TOKEN_DEFS.filter((token) => token.category === category);

type LiveTokens = Record<string, string>;

const appSwitchKeys: readonly string[] = APPS.map((app) => app.hotkey)
	.filter((key) => /^[1-9]$/.test(key))
	.sort();

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
			{appSwitchKeys.map((key) => (
				<kbd key={key} className="app-kbd">
					{key}
				</kbd>
			))}
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
		<GallerySection
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
			<Text size="sm" c="var(--app-text-muted)" mb="sm">
				This page checks itself. Every row below is measured from the live
				document — resolved custom properties, the outline the browser actually
				paints, and the composited backdrop behind every rendered string — so
				the panel fails on the same things a visitor would fail on. It re-runs
				when you change scheme and never during a render.
			</Text>
			<AuditPanel findings={findings} pending={pending} schemeWord={scheme} />
		</GallerySection>
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
	<GallerySection title="Colour tokens" badge={<Palette size={14} />}>
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
			<code>--app-accent</code> is site-provided and required: the shared layer
			reads it with a body-text fallback in the <code>:focus-visible</code> ring
			and in <code>StatusDot --on</code>, so an app that forgets it loses its
			accent without a single warning. The other four are optional —{" "}
			<code>--app-accent-soft</code>, <code>--app-accent-line</code> and{" "}
			<code>--app-accent-hover</code> only ever appear as the fallback half of a{" "}
			<code>--mantine-primary-color-*</code> chain, and{" "}
			<code>--app-accent-ink</code> has one direct reader as well. Each card
			names the value that stands in while its token is unset.
		</Text>
		<SimpleGrid
			cols={{ base: 2, sm: 3, md: 5 }}
			spacing="sm"
			role="group"
			aria-label="Accent token swatches"
		>
			{ACCENT_TOKENS.map((token) => (
				<AccentCard key={token.name} token={token} live={live} />
			))}
		</SimpleGrid>
	</GallerySection>
);

export const RadiusSection = ({ live }: { live: LiveTokens }) => (
	<GallerySection title="Radii" badge={<SquareStack size={14} />}>
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
	</GallerySection>
);

export const ShadowSection = ({ live }: { live: LiveTokens }) => (
	<GallerySection title="Shadows" badge={<Sparkles size={14} />}>
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
	</GallerySection>
);

export const GlassSection = ({ live }: { live: LiveTokens }) => (
	<GallerySection title="Glass and border-strong" badge={<Palette size={14} />}>
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
	</GallerySection>
);

export const TypographySection = ({ live }: { live: LiveTokens }) => (
	<GallerySection title="Typography" badge={<Type size={14} />}>
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
				<code>--app-text-muted</code>. Mantine's <code>dimmed</code> is
				repointed at that same token in <code>base.css</code>, so it lands where
				the audit's muted row lands rather than on Mantine's own grey.
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
	</GallerySection>
);

export const MotionSection = ({ live }: { live: LiveTokens }) => {
	const [moved, setMoved] = useState(false);
	const { keyframes } = useSharedStyles();

	return (
		<GallerySection title="Motion" badge={<Waves size={14} />}>
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
						Driven by a class, not an inline style: the{" "}
						<code>prefers-reduced-motion</code> reset in <code>base.css</code>{" "}
						is a <code>*</code> rule that clamps every stylesheet transition and
						animation to 0.001ms, so it reaches this thumb. The audit's “No
						inline transitions” row counts the inline ones Mantine's own
						components declare.
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
							{keyframes.length} ·{" "}
							{prefersReducedMotion() ? "motion reduced" : "full motion"}
						</Text>
					</Group>
					<Group gap="sm" wrap="wrap">
						{keyframes.map((name) => (
							<Badge key={name} variant="outline" color="brand">
								{name}
							</Badge>
						))}
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
					<Text size="xs" c="var(--app-text-muted)">
						<code>app-boot-pulse</code> runs in the boot splash, which{" "}
						<code>#root:not(:empty) ~ .app-boot</code> hides the moment React
						mounts — so it never animates on screen here.
					</Text>
				</Stack>
			</Stack>
		</GallerySection>
	);
};

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
	<GallerySection title="Controls" badge={<SquareStack size={14} />}>
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
				The row above is Mantine's, not ours: <code>Button</code>,{" "}
				<code>ActionIcon</code> and <code>Badge</code> as Mantine ships them.
				The shared layer retints them from the brand palette, but their shapes,
				weights and states are Mantine's design language. Mantine's{" "}
				<code>dimmed</code> colour is not used for body copy here either:{" "}
				<code>base.css</code> repoints it at <code>--app-text-muted</code>, so
				it measures what the audit's muted row measures. Everything secondary
				reads a <code>--app-text-*</code> token.
			</Text>
		</Stack>
	</GallerySection>
);

export const IndicatorsSection = ({
	onResetScheme,
}: {
	onResetScheme: () => void;
}) => (
	<GallerySection
		title="Indicators"
		badge={<Sparkles size={14} />}
		actions={
			<Text size="xs" c="var(--app-text-muted)">
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
			<LoadingState label="Loading the indicator set">
				<Stack gap={6}>
					<Skeleton width="60%" />
					<Skeleton width="40%" />
					<Skeleton width="80%" height={10} />
				</Stack>
			</LoadingState>
			<LoadingState label="Syncing in the background" hideLabel>
				<Skeleton width="45%" height={10} />
			</LoadingState>
			<ErrorState
				title="The feed did not answer"
				body="Error states reuse the empty-state panel so a failure and an empty result read as the same kind of card — the difference is the assertive announcement."
				action={
					<Button variant="default" size="sm">
						Retry
					</Button>
				}
			/>
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
	</GallerySection>
);

type UtilityDemo = {
	name: string;
	wrap?: string;
	demo: ReactNode;
};

const UTILITY_DEMOS: readonly UtilityDemo[] = [
	{
		name: ".app-press",
		demo: (
			<Button size="compact-sm" className="app-press" variant="default">
				Press me
			</Button>
		),
	},
	{
		name: ".app-surface",
		demo: (
			<div
				className="app-surface"
				style={{ padding: "8px 12px", fontSize: 12 }}
			>
				elevated panel
			</div>
		),
	},
	{
		name: ".app-kbd",
		demo: (
			<>
				<kbd className="app-kbd">⌘K</kbd>
				<kbd className="app-kbd">?</kbd>
			</>
		),
	},
	{
		name: ".app-num",
		demo: (
			<Text size="sm" className="app-num">
				1,234.56
			</Text>
		),
	},
	{
		name: ".app-scroll",
		demo: (
			<span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
				thin, themed scrollbar
			</span>
		),
	},
	{
		name: ".app-rise",
		wrap: "app-rise",
		demo: (
			<span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
				staggered by <code>--app-index</code>
			</span>
		),
	},
];

export const UtilitiesSection = () => {
	const { utilities } = useSharedStyles();
	const boot = utilities.filter((name) => name.startsWith(".app-boot"));

	return (
		<GallerySection title="Utilities" badge={<Ruler size={14} />}>
			<Text size="sm" c="var(--app-text-muted)" mb="sm">
				The <code>app-*</code> classes in the shared stylesheets are what the
				components are made of. They are part of the public surface, so they are
				shown rather than assumed.
			</Text>
			<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
				{UTILITY_DEMOS.map((entry) => (
					<div
						key={entry.name}
						className={`design-utility${entry.wrap ? ` ${entry.wrap}` : ""}`}
					>
						<code className="app-num">{entry.name}</code>
						{entry.demo}
					</div>
				))}
			</SimpleGrid>
			<Text size="xs" c="var(--app-text-muted)" mt="sm">
				{UTILITY_DEMOS.length} of the {utilities.length} <code>app-*</code>{" "}
				classes these stylesheets declare are shown here. The rest compose the
				chrome — header, cards, switcher, toolbar, status and stat marks,
				consent banner, footer. The boot splash is the one family a rendered
				page cannot show: its {boot.length} classes exist only between first
				paint and React's first render, because{" "}
				<code>#root:not(:empty) ~ .app-boot</code> hides them the moment the
				root has children.
			</Text>
			<div className="design-scroll app-scroll" aria-hidden="true">
				<div className="design-scroll__inner">
					{Array.from({ length: 8 }, (_, index) => {
						const width = `${60 + ((index * 7) % 35)}%`;
						return <Skeleton key={index} width={width} />;
					})}
				</div>
			</div>
		</GallerySection>
	);
};

export const DataSection = ({
	stops,
	onToggleStops,
}: {
	stops: number;
	onToggleStops: () => void;
}) => (
	<GallerySection title="Data" badge={<SquareStack size={14} />}>
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
	</GallerySection>
);

export const AppCardsSection = ({
	pinned,
	onTogglePin,
}: {
	pinned: string[];
	onTogglePin: (href: string) => void;
}) => (
	<GallerySection title="App cards" badge={<Layers size={14} />}>
		<Text size="sm" c="var(--app-text-muted)" mb="sm">
			<code>AppCard</code> is the dashboard tile, reused here. Pin a card to see
			the pinned state; the whole surface stays a single link. Its tag badges
			are rendered by the shared component, so the audit above measures shared
			code, not this page.
		</Text>
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
	</GallerySection>
);

export const PatternsSection = () => (
	<GallerySection title="Patterns" badge={<Sparkles size={14} />}>
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
			<LoadingState label="Loading 3 applications">
				<Stack gap={6}>
					<Skeleton width="70%" />
					<Skeleton width="90%" />
					<Skeleton width="50%" />
				</Stack>
			</LoadingState>
		</Card>
		<EmptyState
			icon={<Search size={20} />}
			title="No matches"
			body="Empty-state mark, heading, body and action are shared across every app."
		/>
	</GallerySection>
);

export const ChromeSection = () => (
	<GallerySection title="Chrome" badge={<Layers size={14} />}>
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
				Mantine theme layer: <code>ThemedProvider</code> wraps this page, reads
				the colour mode and hands <code>createAppTheme</code>'s theme to
				Mantine. That theme owns the neutral ramp, shadow scale, default
				component props and accents. The neutral ramp is intentionally{" "}
				<em>not</em> mirrored by <code>tokens.css</code> — they are separate
				layers, as the shared token test locks in.
			</Text>
		</Stack>
	</GallerySection>
);

type LedgerEntry = {
	name: string;
	note: string;
};

const LEDGER: readonly LedgerEntry[] = [
	{
		name: "HeaderOverflow",
		note: "the header's overflow menu below 1100px: exported, styled and tested, but no app mounts it",
	},
	{
		name: "SaveWorkbench",
		note: "the shell the save editors share, driven by a codec and a sample — a page rather than an exhibit",
	},
	{
		name: "usePinnedApps",
		note: "pin state persisted under app_pinned and capped at 8; the App cards above pin with local state",
	},
	{
		name: "useRecents",
		note: "recently visited apps persisted under app_recents and capped at 4",
	},
	{
		name: "ALL_APPS, APP_CATEGORIES",
		note: "the hub-first list the dashboard's shortcuts walk and the category chips its toolbar renders; the cards above use APPS, which excludes the hub",
	},
	{
		name: "src/shared/save/*",
		note: "bytes, base64, AES-CBC, PBKDF2, JSON paths, edits, LZ4 and roundtrip verification the save editors compose — shared code, not design-system surface",
	},
];

export const CoverageSection = () => (
	<GallerySection title="Coverage" badge={<Ruler size={14} />}>
		<Text size="sm" c="var(--app-text-muted)" mb="sm">
			Not everything <code>src/shared</code> exports can be shown, and not every
			component earns a place here. The gap is listed rather than implied:
		</Text>
		<div className="design-ledger">
			{LEDGER.map((entry) => (
				<Fragment key={entry.name}>
					<Text size="sm" fw={600} className="app-num">
						{entry.name}
					</Text>
					<Text size="sm" c="var(--app-text-muted)">
						{entry.note}
					</Text>
				</Fragment>
			))}
		</div>
	</GallerySection>
);
