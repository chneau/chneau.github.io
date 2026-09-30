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
	Swords,
	TrainFront,
	Zap,
} from "lucide-react";

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

/** The dashboard itself. */
const HUB: AppEntry = {
	href: "/",
	icon: Rocket,
	title: "Dashboard",
	tag: "Hub",
	tagColor: "gray",
	category: "Meta",
	shortcutKey: "Home",
	hotkey: "0",
	description: "Personal hub and web apps by chneau.",
};

/** Every sub-app, mirrored by the dashboard cards and its 1–6 hotkeys. */
export const APPS: AppEntry[] = [
	{
		href: "/cv/",
		icon: FileText,
		title: "Curriculum Vitae",
		tag: "Senior Full-Stack & Systems",
		tagColor: "purple",
		category: "Personal",
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
		category: "Personal",
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
		category: "Play",
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
		category: "Build",
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
		category: "Play",
		shortcutKey: "Press 5",
		hotkey: "5",
		description:
			"See what every pub charges for the same drink or dish — searchable map, cheapest-to-dearest rankings and price distribution charts.",
	},
	{
		href: "/tails-of-iron-2-save-editor/",
		icon: Cat,
		title: "Tails of Iron 2 Save Editor",
		tag: "XOR 0x81",
		tagColor: "blue",
		category: "Saves",
		shortcutKey: "Press Q",
		hotkey: "q",
		description:
			"Read and edit Tails of Iron 2 save profiles in your browser — decoded, staged and rebuilt on your own device.",
	},
	{
		href: "/power-fantasy-save-editor/",
		icon: Gem,
		title: "Power Fantasy Save Editor",
		tag: "AES-128-CBC",
		tagColor: "pink",
		category: "Saves",
		shortcutKey: "Press W",
		hotkey: "w",
		description:
			"Decrypt and edit Power Fantasy's AES-encrypted Unity save — blood rubies, heroes, passives and infusions, rebuilt and verified in your browser.",
	},
	{
		href: "/no-rest-for-the-wicked-save-editor/",
		icon: Moon,
		title: "No Rest for the Wicked Save Editor",
		tag: "CERIMAL",
		tagColor: "orange",
		category: "Saves",
		shortcutKey: "Press E",
		hotkey: "e",
		description:
			"Read Moon Studios' CERIMAL format directly — character, realm and account saves decoded and rebuilt byte for byte, on your own device.",
	},
	{
		href: "/dysmantle-save-editor/",
		icon: HardHat,
		title: "DYSMANTLE Save Editor",
		tag: "zlib + XML",
		tagColor: "yellow",
		category: "Saves",
		shortcutKey: "Press R",
		hotkey: "r",
		description:
			"Unpack DYSMANTLE's container, read its XML profile and restage it — materials, skills, recipes and features, rebuilt in your browser.",
	},
	{
		href: "/cyberpunk-2077-save-editor/",
		icon: Zap,
		title: "Cyberpunk 2077 Save Editor",
		tag: "VASC + LZ4",
		tagColor: "yellow",
		category: "Saves",
		shortcutKey: "Press Y",
		hotkey: "y",
		description:
			"Decode Cyberpunk 2077's VASC container and REDengine node tree — attributes, skills and Street Cred, without WolvenKit or a command line.",
	},
	{
		href: "/deadly-days-roadtrip-save-editor/",
		icon: Car,
		title: "Deadly Days Roadtrip Save Editor",
		tag: "GVAS (UE5)",
		tagColor: "orange",
		category: "Saves",
		shortcutKey: "Press U",
		hotkey: "u",
		description:
			"Parse Deadly Days' Unreal Engine 5 GVAS save in the browser — currencies, upgrade levels and character progress, verified before download.",
	},
	{
		href: "/design/",
		icon: Palette,
		title: "Design System",
		tag: "Style guide",
		tagColor: "indigo",
		category: "Build",
		shortcutKey: "Press 6",
		hotkey: "6",
		description:
			"The shared tokens, components and patterns behind every app on this site.",
	},
];

/** Distinct categories, in the order they should appear in the filter. */
export const APP_CATEGORIES: string[] = [
	...new Set(APPS.map((app) => app.category)),
];

/** Dashboard first, then every sub-app. Used by the navbar app switcher. */
export const ALL_APPS: AppEntry[] = [HUB, ...APPS];
