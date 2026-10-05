/**
 * The shape of the keyboard-shortcut sheet and the site-wide keys.
 *
 * A data module, not part of `ShortcutsHelp`, because that file is a component
 * module: a component module that also exports a plain value cannot be
 * Fast-Refreshed without losing the dialog's state, so the whole help dialog
 * full-reloads on every edit to a constant nobody was editing. Types are
 * harmless to move and moved with the value so the sheet has one definition.
 */

export type ShortcutItem = {
	/** Individual keycaps, e.g. `["Shift", "←/→"]`. */
	keys: string[];
	description: string;
};

export type ShortcutGroup = {
	title: string;
	shortcuts: ShortcutItem[];
};

/** Shortcuts every page can advertise once it wires the shared help. */
export const APP_SWITCH_SHORTCUTS: ShortcutItem[] = [
	{ keys: ["1", "2", "3", "4", "5", "6"], description: "Open an app" },
	// The save editors, which are otherwise reachable only by scrolling or
	// searching. `T` is deliberately absent: the dashboard resolves an app
	// before it checks the theme key, so an app bound to `T` would win and the
	// theme toggle would stop working.
	{
		keys: ["Q", "W", "E", "R", "Y", "U"],
		description: "Open a save editor",
	},
	{ keys: ["T"], description: "Toggle light / dark theme" },
];
