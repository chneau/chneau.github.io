/**
 * The single source of truth for every per-app fact on the site.
 *
 * Before this file, the same metadata was restated in three places and had
 * already drifted:
 *
 *   - `rsbuild.config.ts` held one near-identical environment block per app,
 *     and it is the only one that reaches the shipped HTML.
 *   - `src/shared/apps.tsx` held the dashboard's copy (title, tag, category,
 *     hotkey, description and a lucide component).
 *   - `manifests/*.json` held 13 hand-maintained web manifests.
 *
 * All three are now derived from `APP_META`: `rsbuild.config.ts` builds its
 * environments from it, `apps.tsx` maps it to dashboard entries, and
 * `_genManifests.ts` writes the manifest JSON from it.
 *
 * PLAIN DATA ONLY — this module is imported by `rsbuild.config.ts`, which runs
 * in a Node/bundler context. It must not import React, `lucide-react` or any
 * CSS, and it must stay free of side effects.
 *
 * Reconciliation (where two sources disagreed, the shipped build won):
 *
 *   - `cv`: `rsbuild.config.ts` (the document + og:description that actually
 *     ships) and `manifests/cv.json` carried different descriptions. The
 *     generated manifest now uses the rsbuild one, so `manifests/cv.json`
 *     changes from "… — experience, expertise and contact." to the
 *     "10+ years experience…" sentence. Nothing invented; the shipped value
 *     wins.
 *   - `spooners`: the manifest said "… — a searchable price map." while the
 *     shipped HTML said "… — searchable map, cheapest-to-dearest rankings and
 *     price distribution charts."; the rsbuild value is kept.
 *   - `design`: the manifest said "The shared design tokens and components
 *     behind chneau.github.io." while the shipped HTML said "The shared
 *     tokens, components and patterns behind every app on this site."; the
 *     rsbuild value is kept.
 *   - `birthday`: the manifest dropped the serial (Oxford) comma in
 *     "zodiac signs(,) and export calendar events"; the shipped HTML has it,
 *     so it is kept.
 *   - `root`: the dashboard card describes the hub as "Personal hub and web
 *     apps by chneau." while the document/meta description is the longer
 *     sentence. Both are real and both are kept: `description` is the meta /
 *     manifest value, `dashboard.description` is the card value.
 *
 * Every other value is byte-for-byte what one of the three sources already
 * carried. (The regenerated `manifests/*.json` also normalise seven files that
 * had escaped em-dashes, `\u2014`, to the literal `—`; the text is unchanged.)
 */

/** A file copied verbatim into an environment's published output. */
type AppCopy = {
	/** Source path, relative to the repository root. */
	from: string;
	/** Destination, relative to the environment's `distPath.root`. */
	to: string;
};

/** A structured-data block trimmed to the two documents the site declares. */
type AppJsonLd = "website" | "person";

export type AppMeta = {
	/** Environment key, manifest filename and icon asset slug, all in one. */
	slug: string;
	/** Document path: the canonical URL, the manifest start_url/scope and the dashboard href. */
	path: string;
	/** Rsbuild source entry. */
	entry: string;
	/** Document title, og:title and twitter:title. */
	title: string;
	/** Meta description, og:description and the manifest description. */
	description: string;
	themeColor: string;
	backgroundColor: string;
	/** Manifest `name`; it may differ from the document title. */
	manifestName: string;
	/** Manifest `short_name`. */
	manifestShortName: string;
	/** The favicon glyph painted into the tab as a data-URL SVG. */
	emoji: string | null;
	/** Lucide component NAME; `apps.tsx` maps it to the component explicitly. */
	lucideIcon: string;
	/** Whether this environment's UI reads the injected `BUILD_DATE`. */
	defineBuildDate: boolean;
	/** Open Graph `og:type` for the document. */
	metaType: "website" | "profile";
	/** Extra `og:locale:alternate` values; empty everywhere but birthday. */
	alternateLocales: string[];
	/** JSON-LD documents to inline, in order. */
	jsonLd: AppJsonLd[];
	/** Extra copies on top of the app's own `manifest.json`. */
	copies: AppCopy[];
	/** Dashboard-facing fields, mirrored by the app cards and the hotkeys. */
	dashboard: {
		title: string;
		tag: string;
		tagColor: string;
		/** Broad grouping used by the dashboard's category filter. */
		category: string;
		shortcutKey: string;
		hotkey: string;
		description: string;
	};
};

/** Every environment, root first, then the sub-apps in dashboard order. */
export const APP_META: readonly AppMeta[] = [
	{
		slug: "root",
		path: "/",
		entry: "./src/root/index.tsx",
		title: "chneau.github.io",
		description:
			"Personal hub and web apps by chneau — CV, birthday tracker, Scottish rail replay, save editor and pub price maps.",
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
		dashboard: {
			title: "Dashboard",
			tag: "Hub",
			tagColor: "gray",
			category: "Meta",
			shortcutKey: "Home",
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
		dashboard: {
			title: "Curriculum Vitae",
			tag: "Senior Full-Stack & Systems",
			tagColor: "purple",
			category: "Personal",
			shortcutKey: "Press 1",
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
		dashboard: {
			title: "Birthday Tracker",
			tag: "Tracker",
			tagColor: "blue",
			category: "Personal",
			shortcutKey: "Press 2",
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
		dashboard: {
			title: "A Day in Scottish Rail",
			tag: "24h Replay",
			tagColor: "cyan",
			category: "Play",
			shortcutKey: "Press 3",
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
		// No emoji: the config draws a bespoke crimson shield for this app.
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
		dashboard: {
			title: "Crimson Desert Save Editor",
			tag: "100% Client-Side",
			tagColor: "yellow",
			category: "Build",
			shortcutKey: "Press 4",
			hotkey: "4",
			description:
				"Edit Crimson Desert save files — inventory, gear, skills, quests and companions — entirely on your device.",
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
		dashboard: {
			title: "Spooners",
			tag: "Price map",
			tagColor: "green",
			category: "Play",
			shortcutKey: "Press 5",
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
		dashboard: {
			title: "Tails of Iron 2 Save Editor",
			tag: "XOR 0x81",
			tagColor: "blue",
			category: "Saves",
			shortcutKey: "Press Q",
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
		dashboard: {
			title: "Power Fantasy Save Editor",
			tag: "AES-128-CBC",
			tagColor: "pink",
			category: "Saves",
			shortcutKey: "Press W",
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
		dashboard: {
			title: "No Rest for the Wicked Save Editor",
			tag: "CERIMAL",
			tagColor: "orange",
			category: "Saves",
			shortcutKey: "Press E",
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
		dashboard: {
			title: "DYSMANTLE Save Editor",
			tag: "zlib + XML",
			tagColor: "yellow",
			category: "Saves",
			shortcutKey: "Press R",
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
		dashboard: {
			title: "Cyberpunk 2077 Save Editor",
			tag: "VASC + LZ4",
			tagColor: "yellow",
			category: "Saves",
			shortcutKey: "Press Y",
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
		dashboard: {
			title: "Deadly Days Roadtrip Save Editor",
			tag: "GVAS (UE5)",
			tagColor: "orange",
			category: "Saves",
			shortcutKey: "Press U",
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
		// Cold, tarnished steel — the app's northern-fantasy palette, and far from
		// Crimson Desert's red and Cyberpunk's yellow.
		themeColor: "#8c9bab",
		backgroundColor: "#0e0e11",
		manifestName: "Witcher 3 Save Editor",
		manifestShortName: "Witcher 3",
		// Not null: a null emoji falls back to the config's bespoke crimson
		// shield, which belongs to Crimson Desert.
		emoji: "🐺",
		lucideIcon: "Sword",
		defineBuildDate: false,
		metaType: "website",
		alternateLocales: [],
		jsonLd: [],
		copies: [],
		dashboard: {
			title: "Witcher 3 Save Editor",
			tag: "SNFH + SAV3",
			tagColor: "teal",
			category: "Saves",
			shortcutKey: "Press 7",
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
		dashboard: {
			title: "Design System",
			tag: "Style guide",
			tagColor: "indigo",
			category: "Build",
			shortcutKey: "Press 6",
			hotkey: "6",
			description:
				"The shared tokens, components and patterns behind every app on this site.",
		},
	},
];
