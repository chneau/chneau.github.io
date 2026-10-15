/**
 * The shape of the keyboard-shortcut sheet and the site-wide keys.
 *
 * A data module, not part of `ShortcutsHelp`, because that file is a component
 * module: a component module that also exports a plain value cannot be
 * Fast-Refreshed without losing the dialog's state, so the whole help dialog
 * full-reloads on every edit to a constant nobody was editing. Types are
 * harmless to move and moved with the value so the sheet has one definition.
 */

import { APP_META } from "./app-meta";

export type ShortcutItem = {
	/** Individual keycaps, e.g. `["Shift", "←/→"]`. */
	keys: string[];
	description: string;
};

export type ShortcutGroup = {
	title: string;
	shortcuts: ShortcutItem[];
};

/**
 * The digits that open an app, read from the registry rather than written out.
 *
 * The list here said `1`–`6` and had drifted: `witcher-3-save-editor` is bound
 * to `7`, so the help sheet — the one place a visitor goes to find out what the
 * keys are — left an app's key unadvertised while claiming to enumerate them.
 * The hub's `0` is deliberately absent: it scrolls to the top and focuses the
 * search rather than navigating, which the dashboard does on purpose, and the
 * app switcher advertises it as the hub's own key.
 */
const appDigitHotkeys = APP_META.map((meta) => meta.dashboard.hotkey)
	.filter((key) => /^[1-9]$/.test(key))
	.sort();

/** Shortcuts every page can advertise once it wires the shared help. */
export const APP_SWITCH_SHORTCUTS: ShortcutItem[] = [
	{ keys: appDigitHotkeys, description: "Open an app" },
	// The save editors, which are otherwise reachable only by scrolling or
	// searching. `T` is deliberately absent: the dashboard resolves an app
	// before it checks the theme key, so an app bound to `T` would win and the
	// theme toggle would stop working.
	{
		keys: APP_META.map((meta) => meta.dashboard.hotkey)
			.filter((key) => /^[a-z]$/.test(key))
			.map((key) => key.toUpperCase()),
		description: "Open a save editor",
	},
	{ keys: ["T"], description: "Toggle light / dark theme" },
];
