import { useMantineColorScheme } from "@mantine/core";
import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { AppSwitcher } from "./AppSwitcher";
import { BackHome } from "./BackHome";
import { Brand } from "./Brand";
import { HeaderOverflow } from "./HeaderOverflow";
import { SchemeToggle } from "./SchemeToggle";
import {
	type ShortcutGroup,
	type ShortcutItem,
	ShortcutsHelp,
	ShortcutsHelpButton,
	useShortcutsHelp,
} from "./ShortcutsHelp";

/** The light/dark pair a navbar control needs, supplied by whoever owns it. */
type NavTheme = {
	dark: boolean;
	onToggle: () => void;
};

type AppNavProps = {
	/** Identity block. `icon` is the accent mark beside the title. */
	icon?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	/**
	 * Rendered inside the brand slot ahead of `Brand`. Only crimson-desert uses
	 * it, for a navigation toggle that belongs with the brand rather than in the
	 * action row.
	 */
	brandExtra?: ReactNode;
	/** The brand links home by default; pass `null` for an app that cannot. */
	brandHref?: string | null;
	/**
	 * The app's own controls. On a wide bar they sit inline; on a narrow one they
	 * collapse behind "More" (see `HeaderOverflow`).
	 */
	actions?: ReactNode;
	/** Optional centre slot, for a search box or status badges. */
	center?: ReactNode;
	/** Shortcut groups for the shared help dialog this navbar owns. */
	shortcuts?: ShortcutGroup[];
	/** Extra site-wide keys, e.g. `APP_SWITCH_SHORTCUTS`. */
	globalShortcuts?: ShortcutItem[];
	/**
	 * Whether this app binds the command palette, so the help dialog only
	 * advertises ⌘/Ctrl+K where it works. Six save editors do not.
	 */
	hasCommandPalette?: boolean;
	/**
	 * The dashboard is the hub and has nowhere to go back to, so it opts out.
	 * Every other app gets `BackHome` first, which is the order the whole site
	 * agreed on — `design` used to disagree and nothing caught it.
	 */
	showBackHome?: boolean;
	/**
	 * Where the theme control reads from. Omitted, it follows Mantine's colour
	 * scheme, which every app's `MantineProvider` already drives. Pass it only
	 * where an app keeps its own source — birthday's Valtio store.
	 *
	 * This is deliberately not inferred from the app: the refactor moves where
	 * the control is rendered, never where its state comes from, so an app's
	 * theme behaviour cannot change as a side effect of adopting `AppNav`.
	 */
	theme?: NavTheme;
	/** Drop sticky positioning when the header sits inside a fixed layout. */
	staticPosition?: boolean;
	className?: string;
};

/**
 * The one navbar, for every app on the site.
 *
 * Seven apps were each assembling the same five things by hand — the brand,
 * `BackHome`, the app switcher, the shortcuts button, the theme toggle, and the
 * shortcuts dialog mounted at the root of the tree — and the save editors had a
 * second, different arrangement. Being hand-assembled, the invariant parts had
 * already drifted: `design` put the switcher before the back button, and the
 * theme toggle was in the bar in some apps and behind "More" in others, with no
 * rule that said which. Ordering is now stated once, here.
 *
 * What this component deliberately does *not* own is where an app's state comes
 * from. It renders the controls and wires the dialog; the theme source, the
 * shortcut data and the app's own actions stay with the app that has them.
 */
export const AppNav = ({
	icon,
	title,
	subtitle,
	brandExtra,
	brandHref = "/",
	actions,
	center,
	shortcuts = [],
	globalShortcuts,
	hasCommandPalette = false,
	showBackHome = true,
	theme,
	staticPosition,
	className,
}: AppNavProps) => {
	const shortcutsHelp = useShortcutsHelp();
	const mantine = useMantineColorScheme();
	const resolvedTheme: NavTheme = theme ?? {
		dark: mantine.colorScheme === "dark",
		onToggle: () =>
			mantine.setColorScheme(mantine.colorScheme === "dark" ? "light" : "dark"),
	};

	/**
	 * Only advertise a help button when there is something to read.
	 *
	 * The six save editors had no help dialog before this refactor and declare no
	 * shortcut groups, so giving them the shared button would have shipped a
	 * button that opens an empty dialog — a worse answer than no button.
	 *
	 * The alternative, defaulting them to `APP_SWITCH_SHORTCUTS`, would be a
	 * lie: those keys are bound by the dashboard, not by an app the visitor is
	 * already inside, so listing "1-6: open an app" there would document
	 * something that does nothing.
	 */
	const hasShortcuts =
		shortcuts.length > 0 ||
		(globalShortcuts?.length ?? 0) > 0 ||
		hasCommandPalette;

	return (
		<>
			<AppHeader
				className={className}
				staticPosition={staticPosition}
				brand={
					<>
						{brandExtra}
						<Brand
							href={brandHref ?? undefined}
							icon={icon}
							title={title}
							subtitle={subtitle}
						/>
					</>
				}
				center={center}
				actions={
					<>
						{showBackHome ? <BackHome /> : null}
						<AppSwitcher />
						<HeaderOverflow>
							{actions}
							{hasShortcuts ? (
								<ShortcutsHelpButton
									onClick={shortcutsHelp.open}
									expanded={shortcutsHelp.opened}
								/>
							) : null}
							<SchemeToggle
								dark={resolvedTheme.dark}
								onToggle={resolvedTheme.onToggle}
							/>
						</HeaderOverflow>
					</>
				}
			/>
			{/*
			 * The dialog lives here rather than at the root of each app's tree.
			 * `Modal` portals, so where it is mounted does not change where it
			 * appears — but owning it here is what stops an app shipping a
			 * navbar whose help button opens nothing.
			 */}
			<ShortcutsHelp
				opened={shortcutsHelp.opened}
				onClose={shortcutsHelp.close}
				groups={shortcuts}
				globalShortcuts={globalShortcuts}
				hasCommandPalette={hasCommandPalette}
			/>
		</>
	);
};
