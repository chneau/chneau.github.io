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
	shortcutKey: string;
	hotkey: string;
	description: string;
};

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
	shortcutKey: meta.dashboard.shortcutKey,
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
