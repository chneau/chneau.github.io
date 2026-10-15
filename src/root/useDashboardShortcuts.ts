import { type RefObject, useEffect, useEffectEvent } from "react";
import { ALL_APPS, APPS, type AppEntry } from "../shared";

const hub = ALL_APPS[0];
if (!hub) throw new Error("ALL_APPS must define the hub first");

type DashboardShortcutsOptions = {
	handleVisit: (href: string) => void;
	searchRef: RefObject<HTMLInputElement | null>;
	theme: { toggle: () => void };
	dialogsOpen: boolean;
	filtered?: AppEntry[];
	onOpen?: (href: string) => void;
};

export const useDashboardShortcuts = ({
	handleVisit,
	searchRef,
	theme,
	dialogsOpen,
	filtered,
	onOpen,
}: DashboardShortcutsOptions) => {
	const themeToggle = useEffectEvent(() => theme.toggle());
	const dialogsAreOpen = useEffectEvent(() => dialogsOpen);
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
			if (event.shiftKey && event.key.length === 1) return;
			if (event.defaultPrevented) return;
			if (dialogsAreOpen()) return;
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement ||
				(target instanceof HTMLElement && target.isContentEditable)
			) {
				return;
			}
			if (event.key === "Enter") {
				if (
					target instanceof HTMLElement &&
					target.closest(
						"a[href], button, [role='menuitem'], [role='menuitemcheckbox'], [role='option']",
					)
				) {
					return;
				}
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
			if (event.key === hub.hotkey) {
				event.preventDefault();
				window.scrollTo({ top: 0, behavior: "smooth" });
				focusSearch();
				return;
			}
			const targetApp = APPS.find(
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
