import { type RefObject, useEffect, useEffectEvent } from "react";
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
	//
	// `theme` is a fresh object and `dialogsOpen` changes per render, so both
	// are read through effect events: the listener below is registered once and
	// still acts on the latest committed values, without a ref written during
	// render (which a discarded concurrent render could leave stale).
	const themeToggle = useEffectEvent(() => theme.toggle());
	const dialogsAreOpen = useEffectEvent(() => dialogsOpen);
	// The ref object itself is stable, but what it points at is not: the input
	// is mounted and unmounted by the toolbar, and `/` must focus whichever
	// node is current at the moment the key is pressed. That is a read of the
	// ref's `.current` on every keypress, never a value captured when the
	// listener was registered — which is why it goes through an effect event
	// alongside the others rather than into the dependency array, where it
	// would mean nothing: it cannot change, so listing it would assert a
	// freshness it is not the thing that provides.
	const focusSearch = useEffectEvent(() => searchRef.current?.focus());
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
				return;
			}
			if (dialogsAreOpen()) return;
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
				focusSearch();
				return;
			}
			// The palette and the app switcher both advertise `0` for the hub
			// itself. Navigating to the page you are already on would be a
			// pointless reload, so make the key do the useful thing instead.
			if (event.key === HUB_HOTKEY) {
				event.preventDefault();
				window.scrollTo({ top: 0, behavior: "smooth" });
				focusSearch();
				return;
			}
			const targetApp = APPS.find((app) => app.hotkey === event.key);
			if (targetApp) {
				handleVisit(targetApp.href);
				window.location.href = targetApp.href;
			} else if (event.key.toLowerCase() === "t") {
				themeToggle();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [handleVisit]);
};
