import type { ReactNode } from "react";
import { useThemeMode } from "../hooks/useThemeMode";
import type { ShortcutGroup, ShortcutItem } from "../shortcutData";
import { AppHeader } from "./AppHeader";
import { AppSwitcher } from "./AppSwitcher";
import { BackHome } from "./BackHome";
import { Brand } from "./Brand";
import { HeaderOverflow } from "./HeaderOverflow";
import { SchemeToggle } from "./SchemeToggle";
import {
	ShortcutsHelp,
	ShortcutsHelpButton,
	useShortcutsHelp,
} from "./ShortcutsHelp";

type NavTheme = {
	dark: boolean;
	onToggle: () => void;
};

type AppNavProps = {
	icon?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	brandExtra?: ReactNode;
	brandHref?: string | null;
	actions?: ReactNode;
	center?: ReactNode;
	shortcuts?: readonly ShortcutGroup[];
	globalShortcuts?: ShortcutItem[];
	hasCommandPalette?: boolean;
	showBackHome?: boolean;
	theme?: NavTheme;
	staticPosition?: boolean;
	className?: string;
};

const EMPTY_SHORTCUTS: readonly ShortcutGroup[] = [];

export const AppNav = ({
	icon,
	title,
	subtitle,
	brandExtra,
	brandHref = "/",
	actions,
	center,
	shortcuts = EMPTY_SHORTCUTS,
	globalShortcuts,
	hasCommandPalette = false,
	showBackHome = true,
	theme,
	staticPosition,
	className,
}: AppNavProps) => {
	const shortcutsHelp = useShortcutsHelp();
	const shared = useThemeMode();
	const resolvedTheme: NavTheme = theme ?? {
		dark: shared.dark,
		onToggle: shared.toggle,
	};

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
