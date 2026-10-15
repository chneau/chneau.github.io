import { APP_META } from "./app-meta";

export type ShortcutItem = {
	keys: string[];
	description: string;
};

export type ShortcutGroup = {
	title: string;
	shortcuts: ShortcutItem[];
};

const appDigitHotkeys = APP_META.map((meta) => meta.dashboard.hotkey)
	.filter((key) => /^[1-9]$/.test(key))
	.sort();

export const APP_SWITCH_SHORTCUTS: ShortcutItem[] = [
	{ keys: appDigitHotkeys, description: "Open an app" },
	{
		keys: APP_META.map((meta) => meta.dashboard.hotkey)
			.filter((key) => /^[a-z]$/.test(key))
			.map((key) => key.toUpperCase()),
		description: "Open a save editor",
	},
	{ keys: ["T"], description: "Toggle light / dark theme" },
];
