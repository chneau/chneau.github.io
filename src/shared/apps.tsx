import {
	Beer,
	BookOpen,
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
	category: string;
	shortcutKey: string;
	hotkey: string;
	description: string;
};

export const hotkeyLabel = (hotkey: string): string =>
	hotkey.length === 1 ? `Press ${hotkey.toUpperCase()}` : hotkey;

const LUCIDE_ICONS: Record<string, LucideIcon> = {
	Beer,
	BookOpen,
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

const HUB: AppEntry = toEntry(hub);

export const APPS: AppEntry[] = subApps.map(toEntry);

export const APP_CATEGORIES: string[] = [
	...new Set(APPS.map((app) => app.category)),
];

export const ALL_APPS: AppEntry[] = [HUB, ...APPS];
