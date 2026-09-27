import {
	Beer,
	Cake,
	FileText,
	type LucideIcon,
	Palette,
	Rocket,
	Swords,
	TrainFront,
} from "lucide-react";

export type AppEntry = {
	href: string;
	icon: LucideIcon;
	title: string;
	tag: string;
	tagColor: string;
	shortcutKey: string;
	hotkey: string;
	description: string;
};

/** The dashboard itself. */
const HUB: AppEntry = {
	href: "/",
	icon: Rocket,
	title: "Dashboard",
	tag: "Hub",
	tagColor: "gray",
	shortcutKey: "Home",
	hotkey: "0",
	description: "Personal hub and web apps by chneau.",
};

/** Every sub-app, mirrored by the dashboard cards and its 1–5 hotkeys. */
export const APPS: AppEntry[] = [
	{
		href: "/cv/",
		icon: FileText,
		title: "Curriculum Vitae",
		tag: "Senior Full-Stack & Systems",
		tagColor: "purple",
		shortcutKey: "Press 1",
		hotkey: "1",
		description:
			"Senior Full-Stack & Systems Engineer — 10+ years experience across Go, TypeScript, React 19, Python, cloud infrastructure & optimization.",
	},
	{
		href: "/birthday/",
		icon: Cake,
		title: "Birthday Tracker",
		tag: "Tracker",
		tagColor: "blue",
		shortcutKey: "Press 2",
		hotkey: "2",
		description:
			"Track birthdays, milestones, biorhythms, zodiac signs, and export calendar events.",
	},
	{
		href: "/scotland-rail/",
		icon: TrainFront,
		title: "A Day in Scottish Rail",
		tag: "24h Replay",
		tagColor: "cyan",
		shortcutKey: "Press 3",
		hotkey: "3",
		description:
			"Interactive 24-hour time-lapse train replay across Scotland's rail network.",
	},
	{
		href: "/crimson-desert-save-editor/",
		icon: Swords,
		title: "Crimson Desert Save Editor",
		tag: "100% Client-Side",
		tagColor: "yellow",
		shortcutKey: "Press 4",
		hotkey: "4",
		description:
			"Edit Crimson Desert save files — inventory, gear, skills, quests and companions — entirely on your device.",
	},
	{
		href: "/spooners/",
		icon: Beer,
		title: "Spooners",
		tag: "Price map",
		tagColor: "green",
		shortcutKey: "Press 5",
		hotkey: "5",
		description:
			"See what every pub charges for the same drink or dish — searchable map, cheapest-to-dearest rankings and price distribution charts.",
	},
	{
		href: "/design/",
		icon: Palette,
		title: "Design System",
		tag: "Style guide",
		tagColor: "indigo",
		shortcutKey: "Press 6",
		hotkey: "6",
		description:
			"The shared tokens, components and patterns behind every app on this site.",
	},
];

/** Dashboard first, then every sub-app. Used by the navbar app switcher. */
export const ALL_APPS: AppEntry[] = [HUB, ...APPS];
