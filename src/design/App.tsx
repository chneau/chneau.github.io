import { Badge, Group, type MantineColorsTuple, Stack } from "@mantine/core";
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
	ThemedProvider,
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
	CoverageSection,
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

const appTheme = createAppTheme({
	accent: brand,
	accentName: "brand",
	primaryShade: { light: 6, dark: 5 },
	overrides: {
		respectReducedMotion: true,
	},
});

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

export const App = () => {
	const theme = useThemeMode();
	const dark = theme.dark;
	const scheme = theme.resolved;
	const [stops, setStops] = useState(24);
	const [pinned, setPinned] = useState<string[]>([]);
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();

	const { layers, live } = useTokenSnapshot(scheme);
	const { findings, audited } = useSchemeAudit(scheme);

	const themeRef = useRef(theme);
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
			const target = APPS.find(
				(app) => app.hotkey.toLowerCase() === event.key.toLowerCase(),
			);
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
				themeRef.current.reset();
			},
		},
	];

	const auditPending = findings.length === 0 || audited !== scheme;

	return (
		<ThemedProvider theme={appTheme}>
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

						<CoverageSection />
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
		</ThemedProvider>
	);
};
