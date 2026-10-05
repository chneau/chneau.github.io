import {
	Badge,
	Group,
	type MantineColorsTuple,
	MantineProvider,
	Stack,
} from "@mantine/core";
import { Keyboard, Layers, Moon, RotateCcw, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	APP_SWITCH_SHORTCUTS,
	APPS,
	AppNav,
	type Command,
	CommandPalette,
	CommandPaletteButton,
	createAppTheme,
	Footer,
	Grain,
	SkipLink,
	useCommandPalette,
	useShortcutsHelp,
	useThemeMode,
} from "../shared";
import { AUDIT_SETTLE_MS, type Finding, runAudit } from "./audit";
import {
	AppCardsSection,
	AuditSection,
	ChromeSection,
	ColourTokensSection,
	ControlsSection,
	DataSection,
	DesignHero,
	GlassSection,
	IndicatorsSection,
	MotionSection,
	PatternsSection,
	RadiusSection,
	ShadowSection,
	TypographySection,
	UtilitiesSection,
} from "./sections";
import { useTokenSnapshot } from "./tokens";

/* ══════════════════════════════════════════════════════════════════════
   Theme
   ══════════════════════════════════════════════════════════════════════ */

const brand: MantineColorsTuple = [
	"#eef2ff",
	"#e0e7fe",
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
   The accessibility sweep
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Runs the audit once per scheme, and only once the document has stopped
 * moving.
 *
 * The settle is load-bearing rather than cosmetic. `.app-card` transitions
 * `background-color` over 0.3s, so reading one animation frame after the
 * toggle catches a *mid-interpolation* backdrop — `rgb(118, 118, 120)` instead
 * of `rgb(18, 18, 21)` — and the sweep then confidently reports near-white
 * cards holding near-white text. Listening for the first `transitionend` is not
 * enough either: any short transition in the page (a 150ms chevron) fires first
 * and the sweep runs mid-fade again.
 *
 * `getAnimations()` is the precise instrument — it lists exactly the running
 * transitions, so awaiting all of them means the measurement happens when the
 * document is genuinely at rest. Infinite animations (`app-breathe`,
 * `app-shimmer`) never finish, so they are excluded and the timer is only a
 * backstop.
 *
 * The findings and the scheme they were measured in are one object, written in
 * one go. As two pieces of state they could disagree — a render between
 * "clear the rows" and "record the scheme" is what puts light-scheme numbers
 * under a dark heading — and the invariant that prevents that is now a type
 * rather than a convention.
 */
const useSchemeAudit = (
	scheme: "light" | "dark",
): { findings: readonly Finding[]; audited: "light" | "dark" } => {
	const [audit, setAudit] = useState<{
		scheme: "light" | "dark";
		findings: readonly Finding[];
	}>({ scheme: "light", findings: [] });

	const scheduleAudit = useCallback((next: "light" | "dark") => {
		let cancelled = false;
		let timer = 0;

		setAudit({ scheme: next, findings: [] });

		const finish = () => {
			if (cancelled) return;
			window.requestAnimationFrame(() => {
				if (!cancelled) setAudit({ scheme: next, findings: runAudit(next) });
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

	return { findings: audit.findings, audited: audit.scheme };
};

/* ══════════════════════════════════════════════════════════════════════
   App
   ══════════════════════════════════════════════════════════════════════ */

/**
 * The gallery shell: the scheme, the sweep, the page shortcuts, and the order
 * the sections appear in. The sections themselves live in `sections.tsx`, each
 * one owning whatever only it uses.
 */
export const App = () => {
	// The one shared theme store: persists the choice, follows the OS until the
	// visitor picks a scheme for themselves, and mirrors it onto <html> so the
	// drift check below reads the live tokens. `scheme` is always concrete,
	// never `auto`.
	const theme = useThemeMode();
	const dark = theme.dark;
	const scheme = theme.resolved;
	// `stops` and `pinned` are page-wide because the palette's "reset demo
	// controls" command writes both; everything else the sections need, they own.
	const [stops, setStops] = useState(24);
	const [pinned, setPinned] = useState<string[]>([]);
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();

	const { layers, live } = useTokenSnapshot(scheme);
	const { findings, audited } = useSchemeAudit(scheme);

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
						<DesignHero />

						<AuditSection
							findings={findings}
							pending={auditPending}
							scheme={scheme}
						/>

						<ColourTokensSection layers={layers} live={live} scheme={scheme} />

						<RadiusSection live={live} />

						<ShadowSection live={live} />

						<GlassSection live={live} />

						<TypographySection live={live} />

						<MotionSection live={live} />

						<ControlsSection
							dark={dark}
							onToggleScheme={theme.toggle}
							onOpenPalette={palette.open}
							onOpenShortcuts={shortcuts.open}
						/>

						<IndicatorsSection onResetScheme={theme.reset} />

						<UtilitiesSection />

						<DataSection
							stops={stops}
							onToggleStops={() =>
								setStops((value) => (value === 24 ? 31 : 24))
							}
						/>

						<AppCardsSection pinned={pinned} onTogglePin={togglePin} />

						<PatternsSection />

						<ChromeSection />
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
