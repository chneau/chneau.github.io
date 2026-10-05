import { type MantineColorsTuple, MantineProvider } from "@mantine/core";
import { FileText, FileType, Keyboard, Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import {
	AppNav,
	type Command,
	CommandPalette,
	createAppTheme,
	Footer,
	Grain,
	SkipLink,
	useCommandPalette,
	useShortcutsHelp,
	useThemeMode,
} from "../shared";
import { DOCX_URL, PDF_URL } from "./content";
import { useHeroVisibility } from "./hero-visibility";
import { BackToTop, Body, FooterLinks, HeaderActions, Hero } from "./sections";
import { CV_THEME_KEY } from "./theme";

declare const BUILD_DATE: string;

/** Desaturated emerald ramp, mirroring the CV's `--accent` token. */
const cvAccent: MantineColorsTuple = [
	"#e7f7f0",
	"#c5ecdd",
	"#9fdcc7",
	"#74cbae",
	"#4fbd99",
	"#22b083",
	"#127f5f",
	"#0e6a4f",
	"#0a553f",
	"#06402f",
];

const cvTheme = createAppTheme({ accent: cvAccent });

/**
 * The page shell: theme, chrome, and the document itself.
 *
 * The document's own sections live in `sections.tsx`, one per section, and the
 * CV's prose and data live in `content.tsx`. What is left here is what is
 * genuinely about the page rather than about the CV: the palette, the escape
 * shortcut, and the landmarks.
 */
export const App = () => {
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();
	const theme = useThemeMode(CV_THEME_KEY);
	const { heroRef, heroInView } = useHeroVisibility();

	// Keyboard shortcut: Esc returns to the dashboard, but never while a dialog
	// or an interactive control already handles the key. Mantine closes its
	// modals without `preventDefault`, so the palette/listbox must be guarded
	// too or keyboard users get ejected from the page.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (event.defaultPrevented) return;
			if (shortcuts.opened || palette.opened) return;
			const active = document.activeElement;
			if (
				active instanceof HTMLElement &&
				active.closest(
					'[role="menu"], [role="listbox"], [role="option"], input, textarea, select, button, a[href]',
				)
			) {
				return;
			}
			window.location.href = "/";
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [shortcuts.opened, palette.opened]);

	const commands: Command[] = [
		{
			id: "toggle-theme",
			label: "Toggle light / dark theme",
			hint: "Theme",
			icon: theme.dark ? <Sun size={16} /> : <Moon size={16} />,
			run: theme.toggle,
		},
		{
			id: "keyboard-shortcuts",
			label: "Keyboard shortcuts",
			hint: "Help",
			icon: <Keyboard size={16} />,
			run: shortcuts.open,
		},
		{
			id: "download-pdf",
			label: "Download PDF",
			hint: "Export",
			keywords: "cv resume export",
			icon: <FileText size={16} />,
			run: () => window.open(PDF_URL, "_blank", "noopener,noreferrer"),
		},
		{
			id: "download-docx",
			label: "Download DOCX",
			hint: "Export",
			keywords: "cv resume word export",
			icon: <FileType size={16} />,
			run: () => window.open(DOCX_URL, "_blank", "noopener,noreferrer"),
		},
	];

	return (
		<MantineProvider
			theme={cvTheme}
			forceColorScheme={theme.dark ? "dark" : "light"}
		>
			<SkipLink />
			<div className="cv-root">
				<div className="no-print">
					<Grain />
				</div>

				{/* The bar holds eight controls here, which is 394px at
				    360px wide — so on a phone the secondary ones collapse
				    into the overflow menu `AppNav` wraps them in. */}
				<AppNav
					// This app binds the command palette, so the shared help dialog
					// may advertise it.
					hasCommandPalette
					className="no-print"
					icon={<span style={{ fontSize: 13, fontWeight: 700 }}>CN</span>}
					title="Charles Neau"
					subtitle="Curriculum Vitae"
					theme={{ dark: theme.dark, onToggle: theme.toggle }}
					shortcuts={[
						{
							title: "Page",
							shortcuts: [
								{ keys: ["Esc"], description: "Return to the dashboard" },
							],
						},
					]}
					actions={<HeaderActions />}
				/>

				<main id="main" tabIndex={-1}>
					<Hero heroRef={heroRef} />
					<Body />
				</main>

				<Footer
					className="no-print"
					left={<FooterLinks />}
					right={BUILD_DATE ? `Built ${BUILD_DATE}` : undefined}
				/>

				<BackToTop heroInView={heroInView} />
			</div>
			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
