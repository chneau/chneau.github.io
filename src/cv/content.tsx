import { Globe, Mail, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { GithubMark, LinkedinMark } from "./brand-marks";

/**
 * The CV's content, kept separate from its presentation so edits are a data
 * change rather than a React change. Keeping it typed also makes it easy to
 * diff against the printable `cv.md` generated in the `chneau/cv` repo.
 *
 * This module is content and nothing else: no component is defined or exported
 * here. The two brand marks are presentation and live in `brand-marks.tsx`,
 * imported below for the contact rows. Mixing the two would make "the CV" read
 * as a React tree rather than as a document, which is what this file is for.
 */

const EMAIL = "charles63500@gmail.com";
const PHONE_DISPLAY = "+44 7397 174345";
const PHONE_HREF = "+447397174345";

/** Remote exports; see the repo README for the upstream `chneau/cv` source. */
export const PDF_URL =
	"https://raw.githubusercontent.com/chneau/cv/master/cv.pdf";
export const DOCX_URL =
	"https://raw.githubusercontent.com/chneau/cv/master/cv.docx";

type SkillGroup = { category: string; items: string[] };

export const SKILLS: SkillGroup[] = [
	{
		category: "Languages & Core",
		items: [
			"Go",
			"TypeScript",
			"Rust",
			"Python",
			"C#",
			"C++",
			"SQL",
			"Bash",
			"JavaScript",
		],
	},
	{
		category: "Backend & Runtimes",
		items: [
			"Go Backend",
			"Bun",
			"Hono",
			"Node.js",
			".NET",
			"Fastify",
			"Express",
			"GraphQL",
			"tRPC",
			"oRPC",
			"WebSockets",
			"WebRTC",
		],
	},
	{
		category: "Frontend & UI",
		items: [
			"React 19",
			"Next.js",
			"Vite",
			"Tailwind CSS",
			"Ant Design",
			"TanStack Query",
			"SolidJS",
			"Blazor",
			"Wouter",
		],
	},
	{
		category: "Databases & Data",
		items: [
			"PostgreSQL",
			"SQLite",
			"Redis",
			"Supabase",
			"Prisma",
			"Drizzle ORM",
			"MongoDB",
			"PostGIS",
			"GIS / OSRM matrices",
		],
	},
	{
		category: "Simulation & Optimization",
		items: [
			"SimPy Simulation",
			"Constraint Solving (CSP)",
			"Combinatorial Scheduling",
			"Zero-Allocation Algorithms",
		],
	},
	{
		category: "Cloud, DevOps & Infra",
		items: [
			"Docker",
			"Kubernetes",
			"GitHub Actions",
			"Terraform",
			"Linux",
			"Nginx",
			"Traefik",
			"Nomad",
			"Cloudflare",
		],
	},
	{
		category: "AI & Developer Tooling",
		items: [
			"Claude Code",
			"Antigravity",
			"Cursor",
			"Copilot",
			"Biome",
			"uv",
			"Hyperfine",
			"Lazygit",
			"Tmux",
		],
	},
];

type Contact = {
	label: string;
	value: string;
	href: string;
	icon: ReactNode;
	copy?: string;
	external?: boolean;
};

export const CONTACTS: Contact[] = [
	{
		label: "Email",
		value: EMAIL,
		href: `mailto:${EMAIL}`,
		icon: <Mail aria-hidden />,
		copy: EMAIL,
	},
	{
		label: "Phone",
		value: PHONE_DISPLAY,
		href: `tel:${PHONE_HREF}`,
		icon: <Phone aria-hidden />,
		copy: PHONE_HREF,
	},
	{
		label: "Web",
		value: "chneau.github.io",
		href: "https://chneau.github.io",
		icon: <Globe aria-hidden />,
		copy: "https://chneau.github.io",
		external: true,
	},
	{
		label: "GitHub",
		value: "github.com/chneau",
		href: "https://github.com/chneau",
		icon: <GithubMark />,
		external: true,
	},
	{
		label: "LinkedIn",
		value: "linkedin.com/in/chneau",
		href: "https://linkedin.com/in/chneau",
		icon: <LinkedinMark />,
		external: true,
	},
];

export type Job = {
	title: string;
	when: string;
	current?: boolean;
	duration: string;
	org: string;
	orgHref: string;
	location: string;
	points: { id: string; body: ReactNode }[];
};

export const JOBS: Job[] = [
	{
		title: "Senior Software Engineer",
		when: "February 2017 – Present",
		current: true,
		duration: "9+ yrs",
		org: "Celerum Ltd",
		orgHref: "https://celerum.co.uk",
		location: "Aberdeen, UK",
		points: [
			{
				id: "platform",
				body: (
					<>
						<strong>Cloud-Native Platform Architecture:</strong> Architected and
						engineered an enterprise cloud-native marine logistics and offshore
						supply vessel planning platform, unifying fragmented services into a
						modern Bun, Hono, React 19, and TypeScript web platform with
						Python/SimPy simulation and C# optimisation engines as specialised
						background workers.
					</>
				),
			},
			{
				id: "optimisation",
				body: (
					<>
						<strong>Optimization & Simulation Engines:</strong> Developed
						discrete-event simulation models and constraint-solving scheduling
						engines for offshore decommissioning, vessel sharing, and complex
						cargo logistics across North Sea operations.
					</>
				),
			},
			{
				id: "microservices",
				body: (
					<>
						<strong>High-Performance Microservices & GIS:</strong> Implemented
						zero-allocation Go microservices and GIS routing pipelines (OSRM
						approximation and spatial distance matrices) processing large-scale
						geospatial and AIS (Automatic Identification System) vessel
						telemetry data.
					</>
				),
			},
			{
				id: "database",
				body: (
					<>
						<strong>Database & Query Optimisation:</strong> Architected
						multi-tenant data tiers across PostgreSQL, SQLite, MongoDB, and
						Redis; designed optimised schema migrations, spatial indexes, and
						caching strategies delivering sub-millisecond query latencies.
					</>
				),
			},
			{
				id: "fullstack",
				body: (
					<>
						<strong>Full-Stack Web Applications:</strong> Built responsive,
						reactive enterprise web portals, dashboards, and scheduling tools
						using React, Vite, Ant Design, Tailwind CSS, and WebSockets for
						real-time fleet tracking.
					</>
				),
			},
			{
				id: "devops",
				body: (
					<>
						<strong>DevOps & CI/CD Infrastructure:</strong> Designed
						containerized deployment pipelines using Docker, Kubernetes, and
						GitHub Actions; established automated linting, testcontainers, and
						fast-feedback builds reducing release deployment cycles.
					</>
				),
			},
			{
				id: "mentorship",
				body: (
					<>
						<strong>Technical Mentorship & Standards:</strong> Led engineering
						best practices, code reviews, architectural documentation, and
						supervised university R&D projects and junior engineers.
					</>
				),
			},
		],
	},
	{
		title: "Software Engineer (KTP Associate)",
		when: "September 2014 – February 2017",
		duration: "2.5 yrs",
		org: "Robert Gordon University",
		orgHref: "https://www.rgu.ac.uk",
		location: "& ARR Craib — Aberdeen, UK",
		points: [
			{
				id: "fleet",
				body: (
					<>
						<strong>Fleet Management System:</strong> Designed, developed, and
						deployed an enterprise-wide real-time fleet logistics and dispatch
						management system for road haulage operations.
					</>
				),
			},
			{
				id: "distributed",
				body: (
					<>
						<strong>Distributed Services & Scaling:</strong> Engineered
						load-balanced microservices handling high-concurrency vehicle
						telemetry, automated job scheduling, and driver dispatching using
						Meteor.js, Node.js, MongoDB, and Java.
					</>
				),
			},
			{
				id: "leadership",
				body: (
					<>
						<strong>Leadership & Stakeholder Alignment:</strong> Led user
						adoption, operator training, and workflow digitalization across
						depot networks; completed professional management and leadership
						training under the UK Knowledge Transfer Partnership (KTP).
					</>
				),
			},
		],
	},
];

const repoLanguage = (language: string): string =>
	`https://github.com/chneau?tab=repositories&language=${language}`;

const repoQuery = (query: string): string =>
	`https://github.com/chneau?tab=repositories&q=${query}`;

/** Exact skill names that map to a GitHub language filter. */
const EXACT_SKILL_URLS = new Map<string, string>([
	["go", repoLanguage("go")],
	["go backend", repoLanguage("go")],
	["typescript", repoLanguage("typescript")],
	["javascript", repoLanguage("javascript")],
	["rust", repoLanguage("rust")],
	["python", repoLanguage("python")],
	["c#", repoLanguage("csharp")],
	["c++", repoLanguage("cpp")],
	["bash", repoLanguage("shell")],
	["sql", repoLanguage("sql")],
]);

/** Ordered keyword fallbacks; the first match wins. */
const KEYWORD_SKILL_URLS: { match: RegExp; url: string }[] = [
	{ match: /simpy/, url: repoLanguage("python") },
	{ match: /osrm|gis|postgis/, url: repoQuery("osrm") },
	{ match: /react/, url: repoQuery("react") },
	{ match: /bun/, url: repoQuery("bun") },
	{ match: /hono/, url: repoQuery("hono") },
	{ match: /docker/, url: repoQuery("docker") },
	{ match: /kubernetes/, url: repoQuery("kubernetes") },
	{ match: /actions/, url: repoQuery("github-actions") },
	{ match: /csp|constraint|scheduling/, url: repoQuery("timetable") },
	{ match: /zero-allocation/, url: repoQuery("openhours") },
];

/** Best-effort GitHub search URL for a skill tag. */
export const skillSearchUrl = (skill: string): string => {
	const lower = skill.toLowerCase();
	const exact = EXACT_SKILL_URLS.get(lower);
	if (exact) return exact;
	const keyword = KEYWORD_SKILL_URLS.find(({ match }) => match.test(lower));
	if (keyword) return keyword.url;
	const firstWord = lower
		.replace(/[^a-z0-9]/g, " ")
		.trim()
		.split(" ")[0];
	const clean = firstWord || lower;
	return repoQuery(encodeURIComponent(clean));
};
