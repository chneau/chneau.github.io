import { type RefObject, useEffect, useEffectEvent } from "react";
import { ALL_APPS, APPS, type AppEntry } from "../shared";

/**
 * The dashboard's own hotkey, as advertised by the command palette and the
 * shared `APP_SWITCH_SHORTCUTS` sheet. Read from the registry rather than
 * written here: this used to be a local literal whose comment claimed the
 * registry was "not ours to change", which is a second copy of the same fact
 * with a rule attached to keeping it in step. `tests/app-hotkeys.test.ts` asserts this file reads
 * the registry, so the literal cannot quietly return.
 */
const hub = ALL_APPS[0];
if (!hub) throw new Error("ALL_APPS must define the hub first");

type DashboardShortcutsOptions = {
	handleVisit: (href: string) => void;
	searchRef: RefObject<HTMLInputElement | null>;
	theme: { toggle: () => void };
	/** True while the shortcuts or palette dialog owns the keyboard. */
	dialogsOpen: boolean;
	/** Current result list, so Enter opens the first match away from the input. */
	filtered?: AppEntry[];
	/** Opens an app href (visit + navigate). */
	onOpen?: (href: string) => void;
};

/** Global keyboard shortcuts for the dashboard: digits, `T`, `/` and `0`. */
export const useDashboardShortcuts = ({
	handleVisit,
	searchRef,
	theme,
	dialogsOpen,
	filtered,
	onOpen,
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
	const firstFiltered = useEffectEvent(() => filtered?.[0]);
	const openFirst = useEffectEvent(() => {
		const app = firstFiltered();
		if (!app) return;
		(onOpen ?? handleVisit)(app.href);
	});
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
				return;
			}
			// Shift is filtered for single characters only, so `Shift+Q` is a
			// capital Q and not the hotkey — Caps Lock still works, because the
			// match below folds case. Shift *is* still honoured for `?`.
			if (event.shiftKey && event.key.length === 1) return;
			// A control that handled the key itself keeps it.
			if (event.defaultPrevented) return;
			if (dialogsAreOpen()) return;
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				(target instanceof HTMLElement && target.isContentEditable)
			) {
				return;
			}
			if (event.key === "Enter") {
				// Enter already means "activate this" when it is aimed at a
				// control: a card link, a pin toggle, a chip, or a row in the
				// app switcher / overflow menu. Swallowing it there both broke
				// the control and recorded a visit to the first search result,
				// which never opened — so the control keeps its own behaviour.
				if (
					target instanceof HTMLElement &&
					target.closest(
						"a[href], button, [role='menuitem'], [role='menuitemcheckbox']",
					)
				) {
					return;
				}
				// Only take the key when there is something to open. `preventDefault`
				// with no result left the keystroke doing nothing at all, which reads
				// as a broken dashboard. Read through the effect event: this listener
				// is registered once, so the prop would be whatever it was when the
				// effect last ran.
				if (!firstFiltered()) return;
				event.preventDefault();
				openFirst();
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
			if (event.key === hub.hotkey) {
				event.preventDefault();
				window.scrollTo({ top: 0, behavior: "smooth" });
				focusSearch();
				return;
			}
			const targetApp = APPS.find(
				// Compare lowercased: `event.key` is capitalised when Shift or Caps
				// Lock is held, and the six letter hotkeys would silently stop firing.
				(app) => app.hotkey.toLowerCase() === event.key.toLowerCase(),
			);
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
