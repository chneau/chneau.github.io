import { type RefObject, useEffect, useRef } from "react";
import { APPS } from "../shared";

/**
 * The dashboard's own hotkey, as advertised by the command palette and the
 * shared `APP_SWITCH_SHORTCUTS` sheet. Kept as a local literal because
 * `src/shared/apps.tsx` owns the registry and is not ours to change.
 */
const HUB_HOTKEY = "0";

type DashboardShortcutsOptions = {
	handleVisit: (href: string) => void;
	searchRef: RefObject<HTMLInputElement | null>;
	theme: { toggle: () => void };
	/** True while the shortcuts or palette dialog owns the keyboard. */
	dialogsOpen: boolean;
};

/** Global keyboard shortcuts for the dashboard: digits, `T`, `/` and `0`. */
export const useDashboardShortcuts = ({
	handleVisit,
	searchRef,
	theme,
	dialogsOpen,
}: DashboardShortcutsOptions) => {
	// Global shortcuts: digits launch apps, T toggles theme, / focuses search.
	// The dialogs own the keyboard while they are open — otherwise a digit typed
	// in the shortcuts sheet would navigate away mid-dialog.
	const themeRef = useRef(theme);
	themeRef.current = theme;
	const dialogsOpenRef = useRef(dialogsOpen);
	dialogsOpenRef.current = dialogsOpen;
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
				return;
			}
			if (dialogsOpenRef.current) return;
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				(target instanceof HTMLElement && target.isContentEditable)
			) {
				return;
			}
			if (event.key === "/") {
				event.preventDefault();
				searchRef.current?.focus();
				return;
			}
			// The palette and the app switcher both advertise `0` for the hub
			// itself. Navigating to the page you are already on would be a
			// pointless reload, so make the key do the useful thing instead.
			if (event.key === HUB_HOTKEY) {
				event.preventDefault();
				window.scrollTo({ top: 0, behavior: "smooth" });
				searchRef.current?.focus();
				return;
			}
			const targetApp = APPS.find((app) => app.hotkey === event.key);
			if (targetApp) {
				handleVisit(targetApp.href);
				window.location.href = targetApp.href;
			} else if (event.key.toLowerCase() === "t") {
				themeRef.current.toggle();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [handleVisit]);
};
