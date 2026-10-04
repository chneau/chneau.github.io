import { Globe, Mail, Phone } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The CV's content, kept separate from its presentation so edits are a data
 * change rather than a React change. Keeping it typed also makes it easy to
 * diff against the printable `cv.md` generated in the `chneau/cv` repo.
 */

const EMAIL = "charles63500@gmail.com";
const PHONE_DISPLAY = "+44 7397 174345";
const PHONE_HREF = "+447397174345";

/** Remote exports; see the repo README for the upstream `chneau/cv` source. */
export const PDF_URL =
	"https://raw.githubusercontent.com/chneau/cv/master/cv.pdf";
export const DOCX_URL =
	"https://raw.githubusercontent.com/chneau/cv/master/cv.docx";

type BrandIconProps = { className?: string };

export const GithubMark = ({ className }: BrandIconProps) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true"
	>
		<path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
	</svg>
);

export const LinkedinMark = ({ className }: BrandIconProps) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		fill="currentColor"
		fillRule="evenodd"
		aria-hidden="true"
	>
		<path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
	</svg>
);

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
