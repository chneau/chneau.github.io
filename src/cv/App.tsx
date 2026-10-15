import { type MantineColorsTuple, MantineProvider } from "@mantine/core";
import { Notifications, notifications } from "@mantine/notifications";
import {
	Copy,
	FileText,
	FileType,
	Keyboard,
	Moon,
	Printer,
	Sun,
} from "lucide-react";
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
import { copyToClipboard } from "./clipboard";
import { DOCX_URL, PDF_URL } from "./content";
import { useHeroVisibility } from "./hero-visibility";
import { BackToTop, Body, FooterLinks, HeaderActions, Hero } from "./sections";
import { CV_THEME_KEY } from "./theme";

declare const BUILD_DATE: string;

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

export const App = () => {
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();
	const theme = useThemeMode(CV_THEME_KEY);
	const { heroRef, heroInView } = useHeroVisibility();

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
		{
			id: "print-save-pdf",
			label: "Print or save as PDF",
			hint: "Export",
			keywords: "cv resume print pdf",
			icon: <Printer size={16} />,
			run: () => window.print(),
		},
		{
			id: "copy-cv-link",
			label: "Copy CV link",
			hint: "Share",
			keywords: "cv url share link",
			icon: <Copy size={16} />,
			run: async () => {
				try {
					await copyToClipboard(window.location.href);
					notifications.show({
						color: "teal",
						title: "Link copied",
						message: "The link to this CV is on your clipboard.",
					});
				} catch {
					notifications.show({
						color: "red",
						title: "Could not copy the link",
						message:
							"Your browser refused access to the clipboard. Copy the address from the bar instead.",
					});
				}
			},
		},
	];

	return (
		<MantineProvider
			theme={cvTheme}
			forceColorScheme={theme.dark ? "dark" : "light"}
		>
			<SkipLink />
			<Notifications position="top-right" />
			<div className="cv-root">
				<div className="no-print">
					<Grain />
				</div>

				<AppNav
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
								{ keys: ["Ctrl", "P"], description: "Print or save as PDF" },
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
