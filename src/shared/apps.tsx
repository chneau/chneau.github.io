import {
	Beer,
	Cake,
	Car,
	Cat,
	FileText,
	Gem,
	HardHat,
	type LucideIcon,
	Moon,
	Palette,
	Rocket,
	Sword,
	Swords,
	TrainFront,
	Zap,
} from "lucide-react";
import { APP_META, type AppMeta } from "./app-meta";

export type AppEntry = {
	href: string;
	icon: LucideIcon;
	title: string;
	tag: string;
	tagColor: string;
	/** Broad grouping used by the dashboard's category filter. */
	category: string;
	/** The prose label for `hotkey`, derived — never hand-written per app. */
	shortcutKey: string;
	/** The `KeyboardEvent.key` value that launches the app; from `APP_META`. */
	hotkey: string;
	description: string;
};

/**
 * The label an app's shortcut is advertised under.
 *
 * A single character is a keycap, uppercased the way a keycap is printed, and
 * reads as `Press Q`. A named key (`Home`, `PageDown`) is already its own
 * label, so it is passed through — `APP_META` carries one such row today (the
 * hub, bound to `0`), and the rule stays rather than special-casing it.
 *
 * This is what makes `hotkey` the single hand-maintained half of the pair. See
 * `tests/app-hotkeys.test.tsx`, which asserts the two can never disagree.
 */
export const hotkeyLabel = (hotkey: string): string =>
	hotkey.length === 1 ? `Press ${hotkey.toUpperCase()}` : hotkey;

/**
 * `APP_META` carries the lucide icon as a NAME (it is plain data, importable by
 * the build config in Node). This is where the name becomes a component: an
 * explicit record, so a typo or a renamed icon fails loudly here rather than
 * silently dropping an icon.
 */
const LUCIDE_ICONS: Record<string, LucideIcon> = {
	Beer,
	Cake,
	Car,
	Cat,
	FileText,
	Gem,
	HardHat,
	Moon,
	Palette,
	Rocket,
	Swords,
	Sword,
	TrainFront,
	Zap,
};

const iconFor = (name: string): LucideIcon => {
	const icon = LUCIDE_ICONS[name];
	if (!icon) throw new Error(`Unknown lucide icon "${name}" in APP_META`);
	return icon;
};

const toEntry = (meta: AppMeta): AppEntry => ({
	href: meta.path,
	icon: iconFor(meta.lucideIcon),
	title: meta.dashboard.title,
	tag: meta.dashboard.tag,
	tagColor: meta.dashboard.tagColor,
	category: meta.dashboard.category,
	shortcutKey: hotkeyLabel(meta.dashboard.hotkey),
	hotkey: meta.dashboard.hotkey,
	description: meta.dashboard.description,
});

const [hub, ...subApps] = APP_META;
if (!hub) throw new Error("APP_META must define the root app first");

/** The dashboard itself. */
const HUB: AppEntry = toEntry(hub);

/** Every sub-app, mirrored by the dashboard cards and its hotkey. */
export const APPS: AppEntry[] = subApps.map(toEntry);

/** Distinct categories, in the order they should appear in the filter. */
export const APP_CATEGORIES: string[] = [
	...new Set(APPS.map((app) => app.category)),
];

/** Dashboard first, then every sub-app. Used by the navbar app switcher. */
export const ALL_APPS: AppEntry[] = [HUB, ...APPS];
