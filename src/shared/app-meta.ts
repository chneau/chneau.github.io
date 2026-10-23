type AppCopy = {
	from: string;
	to: string;
};

type AppJsonLd = "website" | "person";

type TagColor =
	| "gray"
	| "red"
	| "pink"
	| "grape"
	| "violet"
	| "indigo"
	| "blue"
	| "cyan"
	| "teal"
	| "green"
	| "lime"
	| "yellow"
	| "orange";

export type AppMeta = {
	slug: string;
	path: string;
	entry: string;
	title: string;
	description: string;
	themeColor: string;
	backgroundColor: string;
	manifestName: string;
	manifestShortName: string;
	emoji: string | null;
	lucideIcon: string;
	defineBuildDate: boolean;
	metaType: "website" | "profile";
	alternateLocales: string[];
	jsonLd: AppJsonLd[];
	copies: AppCopy[];
	sitemap: {
		changefreq: string;
		priority: number;
	};
	dashboard: {
		title: string;
		tag: string;
		tagColor: TagColor;
		category: string;
		hotkey: string;
		description: string;
	};
};

export const APP_META = [
	{
		slug: "root",
		path: "/",
		entry: "./src/root/index.tsx",
		title: "chneau.github.io",
		description:
			"Personal hub and web apps by chneau — CV, birthday tracker, Scottish rail replay, Unreal and Unity save editors, and pub price maps.",
		themeColor: "#1677ff",
		backgroundColor: "#09090b",
		manifestName: "chneau.github.io",
		manifestShortName: "chneau",
		emoji: "🚀",
		lucideIcon: "Rocket",
		defineBuildDate: true,
		metaType: "website",
		alternateLocales: [],
		jsonLd: ["website", "person"],
		copies: [],
		sitemap: { changefreq: "weekly", priority: 1 },
		dashboard: {
			title: "Dashboard",
			tag: "Hub",
			tagColor: "gray",
			category: "Meta",
			hotkey: "0",
			description: "Personal hub and web apps by chneau.",
		},
	},
	{
		slug: "cv",
		path: "/cv/",
		entry: "./src/cv/index.tsx",
		title: "Charles Neau | Curriculum Vitae",
		description:
			"Senior Full-Stack & Systems Engineer — 10+ years experience across Go, TypeScript, React 19, Python, cloud infrastructure & optimisation.",
		themeColor: "#127f5f",
		backgroundColor: "#0b0e11",
		manifestName: "Charles Neau — Curriculum Vitae",
		manifestShortName: "CV",
		emoji: "📄",
		lucideIcon: "FileText",
		defineBuildDate: true,
		metaType: "profile",
		alternateLocales: [],
		jsonLd: ["person"],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.9 },
		dashboard: {
			title: "Curriculum Vitae",
			tag: "Senior Full-Stack & Systems",
			tagColor: "grape",
			category: "Personal",
			hotkey: "1",
			description:
				"Senior Full-Stack & Systems Engineer — 10+ years experience across Go, TypeScript, React 19, Python, cloud infrastructure & optimisation.",
		},
	},
	{
		slug: "birthday",
		path: "/birthday/",
		entry: "./src/birthday/index.tsx",
		title: "Birthday Tracker",
		description:
			"Track birthdays, milestones, biorhythms, zodiac signs, and export calendar events.",
		themeColor: "#34d399",
		backgroundColor: "#09090b",
		manifestName: "Birthday Tracker",
		manifestShortName: "Birthdays",
		emoji: "🎂",
		lucideIcon: "Cake",
		defineBuildDate: true,
		metaType: "website",
		alternateLocales: ["de_DE", "es_ES", "fr_FR", "gd_GB", "ty_PF", "zh_CN"],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "Birthday Tracker",
			tag: "Tracker",
			tagColor: "blue",
			category: "Personal",
			hotkey: "2",
			description:
				"Track birthdays, milestones, biorhythms, zodiac signs, and export calendar events.",
		},
	},
	{
		slug: "scotland-rail",
		path: "/scotland-rail/",
		entry: "./src/scotland-rail/index.tsx",
		title: "A Day in Scottish Rail | 24h Replay",
		description:
			"Interactive 24-hour time-lapse train replay across Scotland's rail network.",
		themeColor: "#5aa9c9",
		backgroundColor: "#0a141b",
		manifestName: "A Day in Scottish Rail",
		manifestShortName: "Scottish Rail",
		emoji: "🚆",
		lucideIcon: "TrainFront",
		defineBuildDate: true,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "A Day in Scottish Rail",
			tag: "24h Replay",
			tagColor: "cyan",
			category: "Play",
			hotkey: "3",
			description:
				"Interactive 24-hour time-lapse train replay across Scotland's rail network.",
		},
	},
	{
		slug: "crimson-desert-save-editor",
		path: "/crimson-desert-save-editor/",
		entry: "./src/crimson-desert-save-editor/app/main.tsx",
		title: "Crimson Desert Save Editor",
		description:
			"Edit Crimson Desert save files — inventory, gear, skills, quests and companions — entirely on your device.",
		themeColor: "#9d5062",
		backgroundColor: "#0e0e11",
		manifestName: "Crimson Desert Save Editor",
		manifestShortName: "Save Editor",
		emoji: null,
		lucideIcon: "Swords",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [
			{
				from: "./src/crimson-desert-save-editor/assets/image-archive",
				to: "image-archive",
			},
		],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "Crimson Desert Save Editor",
			tag: "100% Client-Side",
			tagColor: "yellow",
			category: "Build",
			hotkey: "4",
			description:
				"Edit Crimson Desert save files — inventory, gear, skills, quests and companions — entirely on your device.",
		},
	},
	{
		slug: "librarian-save-editor",
		path: "/librarian-save-editor/",
		entry: "./src/librarian-save-editor/app/main.tsx",
		title: "Librarian: Tidy Up the Arcane Library Save Editor",
		description:
			"Read the Librarian's Unreal 5.5 save in your browser — spell levels, skill progress and row counts, with every major spell maxed in a click and the rebuilt file verified.",
		themeColor: "#6d5aa8",
		backgroundColor: "#0e0e11",
		manifestName: "Librarian Save Editor",
		manifestShortName: "Librarian",
		emoji: "📚",
		lucideIcon: "BookOpen",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "Librarian Save Editor",
			tag: "UE 5.5 GVAS",
			tagColor: "violet",
			category: "Saves",
			hotkey: "l",
			description:
				"Read the Librarian's Unreal 5.5 save in your browser — spell levels, skill progress and row counts, with every major spell maxed in a click and the rebuilt file verified.",
		},
	},
	{
		slug: "spooners",
		path: "/spooners/",
		entry: "./src/spooners/index.tsx",
		title: "Spooners | Pub prices on a map",
		description:
			"See what every pub charges for the same drink or dish — searchable map, cheapest-to-dearest rankings and price distribution charts.",
		themeColor: "#e6ad00",
		backgroundColor: "#0e0e11",
		manifestName: "Spooners",
		manifestShortName: "Spooners",
		emoji: "🍺",
		lucideIcon: "Beer",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [
			{
				from: "./src/spooners/data/data.json",
				to: "data.json",
			},
		],
		sitemap: { changefreq: "weekly", priority: 0.7 },
		dashboard: {
			title: "Spooners",
			tag: "Price map",
			tagColor: "green",
			category: "Play",
			hotkey: "5",
			description:
				"See what every pub charges for the same drink or dish — searchable map, cheapest-to-dearest rankings and price distribution charts.",
		},
	},
	{
		slug: "tails-of-iron-2-save-editor",
		path: "/tails-of-iron-2-save-editor/",
		entry: "./src/tails-of-iron-2-save-editor/app/main.tsx",
		title: "Tails of Iron 2 Save Editor",
		description:
			"Read and edit Tails of Iron 2 save profiles in your browser — decoded, staged and rebuilt on your own device.",
		themeColor: "#4577a7",
		backgroundColor: "#0e0e11",
		manifestName: "Tails of Iron 2 Save Editor",
		manifestShortName: "Tails Editor",
		emoji: "🐈",
		lucideIcon: "Cat",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "Tails of Iron 2 Save Editor",
			tag: "XOR 0x81",
			tagColor: "blue",
			category: "Saves",
			hotkey: "q",
			description:
				"Read and edit Tails of Iron 2 save profiles in your browser — decoded, staged and rebuilt on your own device.",
		},
	},
	{
		slug: "power-fantasy-save-editor",
		path: "/power-fantasy-save-editor/",
		entry: "./src/power-fantasy-save-editor/app/main.tsx",
		title: "Power Fantasy Save Editor",
		description:
			"Decrypt and edit Power Fantasy's AES-encrypted Unity save — blood rubies, heroes, passives and infusions, rebuilt and verified in your browser.",
		themeColor: "#d44a63",
		backgroundColor: "#0e0e11",
		manifestName: "Power Fantasy Save Editor",
		manifestShortName: "PF Editor",
		emoji: "💎",
		lucideIcon: "Gem",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "Power Fantasy Save Editor",
			tag: "AES-128-CBC",
			tagColor: "pink",
			category: "Saves",
			hotkey: "w",
			description:
				"Decrypt and edit Power Fantasy's AES-encrypted Unity save — blood rubies, heroes, passives and infusions, rebuilt and verified in your browser.",
		},
	},
	{
		slug: "no-rest-for-the-wicked-save-editor",
		path: "/no-rest-for-the-wicked-save-editor/",
		entry: "./src/no-rest-for-the-wicked-save-editor/app/main.tsx",
		title: "No Rest for the Wicked Save Editor",
		description:
			"Read Moon Studios' CERIMAL format directly — character, realm and account saves decoded and rebuilt byte for byte, on your own device.",
		themeColor: "#c8654c",
		backgroundColor: "#0e0e11",
		manifestName: "No Rest for the Wicked Save Editor",
		manifestShortName: "NRW Editor",
		emoji: "🌙",
		lucideIcon: "Moon",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "No Rest for the Wicked Save Editor",
			tag: "CERIMAL",
			tagColor: "orange",
			category: "Saves",
			hotkey: "e",
			description:
				"Read Moon Studios' CERIMAL format directly — character, realm and account saves decoded and rebuilt byte for byte, on your own device.",
		},
	},
	{
		slug: "dysmantle-save-editor",
		path: "/dysmantle-save-editor/",
		entry: "./src/dysmantle-save-editor/app/main.tsx",
		title: "DYSMANTLE Save Editor",
		description:
			"Unpack DYSMANTLE's container, read its XML profile and restage it — materials, skills, recipes and features, rebuilt in your browser.",
		themeColor: "#7f7d47",
		backgroundColor: "#0e0e11",
		manifestName: "DYSMANTLE Save Editor",
		manifestShortName: "DYSMANTLE",
		emoji: "⛑️",
		lucideIcon: "HardHat",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "DYSMANTLE Save Editor",
			tag: "zlib + XML",
			tagColor: "yellow",
			category: "Saves",
			hotkey: "r",
			description:
				"Unpack DYSMANTLE's container, read its XML profile and restage it — materials, skills, recipes and features, rebuilt in your browser.",
		},
	},
	{
		slug: "cyberpunk-2077-save-editor",
		path: "/cyberpunk-2077-save-editor/",
		entry: "./src/cyberpunk-2077-save-editor/app/main.tsx",
		title: "Cyberpunk 2077 Save Editor",
		description:
			"Decode Cyberpunk 2077's VASC container and REDengine node tree — attributes, skills and Street Cred, without WolvenKit or a command line.",
		themeColor: "#e3ad00",
		backgroundColor: "#0e0e11",
		manifestName: "Cyberpunk 2077 Save Editor",
		manifestShortName: "Cyberpunk",
		emoji: "⚡",
		lucideIcon: "Zap",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "Cyberpunk 2077 Save Editor",
			tag: "VASC + LZ4",
			tagColor: "yellow",
			category: "Saves",
			hotkey: "y",
			description:
				"Decode Cyberpunk 2077's VASC container and REDengine node tree — attributes, skills and Street Cred, without WolvenKit or a command line.",
		},
	},
	{
		slug: "deadly-days-roadtrip-save-editor",
		path: "/deadly-days-roadtrip-save-editor/",
		entry: "./src/deadly-days-roadtrip-save-editor/app/main.tsx",
		title: "Deadly Days Roadtrip Save Editor",
		description:
			"Parse Deadly Days' Unreal Engine 5 GVAS save in the browser — currencies, upgrade levels and character progress, verified before download.",
		themeColor: "#de8a2f",
		backgroundColor: "#0e0e11",
		manifestName: "Deadly Days Roadtrip Save Editor",
		manifestShortName: "Deadly Days",
		emoji: "🚗",
		lucideIcon: "Car",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "Deadly Days Roadtrip Save Editor",
			tag: "GVAS (UE5)",
			tagColor: "orange",
			category: "Saves",
			hotkey: "u",
			description:
				"Parse Deadly Days' Unreal Engine 5 GVAS save in the browser — currencies, upgrade levels and character progress, verified before download.",
		},
	},
	{
		slug: "witcher-3-save-editor",
		path: "/witcher-3-save-editor/",
		entry: "./src/witcher-3-save-editor/app/main.tsx",
		title: "Witcher 3 Save Editor",
		description:
			"Edit Witcher 3 PC saves in your browser — money, level, difficulty, skill points, experience and item quantities, written in place and rebuilt entirely on your device.",
		themeColor: "#8c9bab",
		backgroundColor: "#0e0e11",
		manifestName: "Witcher 3 Save Editor",
		manifestShortName: "Witcher 3",
		emoji: "🐺",
		lucideIcon: "Sword",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "monthly", priority: 0.7 },
		dashboard: {
			title: "Witcher 3 Save Editor",
			tag: "SNFH + SAV3",
			tagColor: "teal",
			category: "Saves",
			hotkey: "7",
			description:
				"Edit Witcher 3 PC saves in your browser — money, level, difficulty, skill points, experience and item quantities, written in place and rebuilt entirely on your device.",
		},
	},
	{
		slug: "design",
		path: "/design/",
		entry: "./src/design/index.tsx",
		title: "Design System | chneau.github.io",
		description:
			"The shared tokens, components and patterns behind every app on this site.",
		themeColor: "#6366f1",
		backgroundColor: "#09090b",
		manifestName: "Design System",
		manifestShortName: "Design",
		emoji: "🧩",
		lucideIcon: "Palette",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		sitemap: { changefreq: "yearly", priority: 0.3 },
		dashboard: {
			title: "Design System",
			tag: "Style guide",
			tagColor: "indigo",
			category: "Build",
			hotkey: "6",
			description:
				"The shared tokens, components and patterns behind every app on this site.",
		},
	},
] as const satisfies readonly AppMeta[];
