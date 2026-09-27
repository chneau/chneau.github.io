import { type MantineColorsTuple, MantineProvider } from "@mantine/core";
import {
	ArrowUp,
	ArrowUpRight,
	Check,
	Clock,
	Copy,
	FileText,
	FileType,
	Globe,
	Link2,
	Mail,
	Phone,
	Printer,
	TriangleAlert,
} from "lucide-react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
	AppHeader,
	AppSwitcher,
	BackHome,
	Brand,
	createAppTheme,
	Footer,
	Grain,
	HeaderAction,
	prefersReducedMotion,
	SchemeToggle,
	ShortcutsHelp,
	ShortcutsHelpButton,
	useShortcutsHelp,
} from "../shared";

declare const BUILD_DATE: string;

/** Desaturated emerald ramp, mirroring the CV's `--accent` token. */
const cvAccent: MantineColorsTuple = [
	"#e7f7f0",
	"#c5ecdd",
	"#9fdcc7",
	"#74cbae",
	"#4fbd99",
	"#22b083",
	"#127f5f",
	"#0e6a4f",
	"#0a553f",
	"#06402f",
];

const cvTheme = createAppTheme({ accent: cvAccent });

const EMAIL = "charles63500@gmail.com";
const PHONE_DISPLAY = "+44 7397 174345";
const PHONE_HREF = "+447397174345";

const SKILLS: { category: string; items: string[] }[] = [
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

const getSkillSearchUrl = (skill: string): string => {
	const lower = skill.toLowerCase();
	if (lower === "go" || lower === "go backend") {
		return "https://github.com/chneau?tab=repositories&language=go";
	}
	if (lower === "typescript") {
		return "https://github.com/chneau?tab=repositories&language=typescript";
	}
	if (lower === "javascript") {
		return "https://github.com/chneau?tab=repositories&language=javascript";
	}
	if (lower === "rust") {
		return "https://github.com/chneau?tab=repositories&language=rust";
	}
	if (lower === "python" || lower.includes("simpy")) {
		return "https://github.com/chneau?tab=repositories&language=python";
	}
	if (lower === "c#") {
		return "https://github.com/chneau?tab=repositories&language=csharp";
	}
	if (lower === "c++") {
		return "https://github.com/chneau?tab=repositories&language=cpp";
	}
	if (lower === "bash") {
		return "https://github.com/chneau?tab=repositories&language=shell";
	}
	if (lower === "sql") {
		return "https://github.com/chneau?tab=repositories&language=sql";
	}
	if (
		lower.includes("osrm") ||
		lower.includes("gis") ||
		lower.includes("postgis")
	) {
		return "https://github.com/chneau?tab=repositories&q=osrm";
	}
	if (lower.includes("react")) {
		return "https://github.com/chneau?tab=repositories&q=react";
	}
	if (lower.includes("bun")) {
		return "https://github.com/chneau?tab=repositories&q=bun";
	}
	if (lower.includes("hono")) {
		return "https://github.com/chneau?tab=repositories&q=hono";
	}
	if (lower.includes("docker")) {
		return "https://github.com/chneau?tab=repositories&q=docker";
	}
	if (lower.includes("kubernetes")) {
		return "https://github.com/chneau?tab=repositories&q=kubernetes";
	}
	if (lower.includes("actions")) {
		return "https://github.com/chneau?tab=repositories&q=github-actions";
	}
	if (
		lower.includes("csp") ||
		lower.includes("constraint") ||
		lower.includes("scheduling")
	) {
		return "https://github.com/chneau?tab=repositories&q=timetable";
	}
	if (lower.includes("zero-allocation")) {
		return "https://github.com/chneau?tab=repositories&q=openhours";
	}
	const firstWord = lower
		.replace(/[^a-z0-9]/g, " ")
		.trim()
		.split(" ")[0];
	const clean = firstWord || lower;
	return `https://github.com/chneau?tab=repositories&q=${encodeURIComponent(
		clean,
	)}`;
};

const reveal = (index: number): CSSProperties =>
	({ "--reveal-i": index }) as CSSProperties;

type BrandIconProps = { className?: string };

const GithubMark = ({ className }: BrandIconProps) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true"
	>
		<path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
	</svg>
);

const LinkedinMark = ({ className }: BrandIconProps) => (
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

const copyToClipboard = async (text: string): Promise<void> => {
	if (navigator.clipboard) {
		await navigator.clipboard.writeText(text);
		return;
	}
	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.position = "fixed";
	area.style.opacity = "0";
	document.body.appendChild(area);
	area.select();
	const ok = document.execCommand("copy");
	document.body.removeChild(area);
	if (!ok) throw new Error("copy-failed");
};

type CopyState = "idle" | "ok" | "error";

const useCopy = (getText: () => string, label: string) => {
	const [state, setState] = useState<CopyState>("idle");
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	const copy = useCallback(async () => {
		window.clearTimeout(timer.current);
		try {
			await copyToClipboard(getText());
			setState("ok");
		} catch {
			setState("error");
		}
		timer.current = window.setTimeout(() => setState("idle"), 2200);
	}, [getText]);

	const title =
		state === "ok"
			? `${label} copied`
			: state === "error"
				? `Could not copy ${label.toLowerCase()}`
				: `Copy ${label}`;

	const feedback =
		state === "ok" ? "Copied" : state === "error" ? "Copy failed" : "";

	return { state, title, feedback, copy };
};

const CopyButton = ({ text, label }: { text: string; label: string }) => {
	const { state, title, feedback, copy } = useCopy(() => text, label);

	return (
		<>
			<span className="cv-copy-feedback" role="status" data-state={state}>
				{feedback}
			</span>
			<button
				type="button"
				className="cv-copy no-print"
				data-state={state}
				onClick={copy}
				title={title}
				aria-label={title}
			>
				{state === "ok" ? (
					<Check aria-hidden />
				) : state === "error" ? (
					<TriangleAlert aria-hidden />
				) : (
					<Copy aria-hidden />
				)}
			</button>
		</>
	);
};

const LocalClock = memo(function LocalClock() {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(id);
	}, []);

	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/London",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZoneName: "short",
	}).formatToParts(now);

	const time = parts
		.filter((part) => part.type === "hour" || part.type === "minute")
		.map((part) => part.value)
		.join(":");
	const zone = parts.find((part) => part.type === "timeZoneName")?.value ?? "";

	return (
		<span className="cv-clock">
			{time} {zone}
		</span>
	);
});

const useInView = (ref: RefObject<Element | null>) => {
	const [inView, setInView] = useState(true);

	useEffect(() => {
		const el = ref.current;
		if (!el || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(([entry]) => {
			setInView(entry?.isIntersecting ?? true);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);

	return inView;
};

type Contact = {
	label: string;
	value: string;
	href: string;
	icon: ReactNode;
	copy?: string;
	external?: boolean;
};

const CONTACTS: Contact[] = [
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

type Job = {
	title: string;
	when: string;
	current?: boolean;
	duration: string;
	org: string;
	orgHref: string;
	location: string;
	points: { id: string; body: ReactNode }[];
};

const JOBS: Job[] = [
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
						Python/SimPy simulation and C# optimization engines as specialized
						background workers.
					</>
				),
			},
			{
				id: "optimization",
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
						<strong>Database & Query Optimization:</strong> Architected
						multi-tenant data tiers across PostgreSQL, SQLite, MongoDB, and
						Redis; designed optimized schema migrations, spatial indexes, and
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
						utilizing React, Vite, Ant Design, Tailwind CSS, and WebSockets for
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

const JobItem = ({ job }: { job: Job }) => (
	<article className="cv-job">
		<span
			className="cv-job-dot"
			data-current={job.current ? "true" : "false"}
			aria-hidden
		/>
		<div className="cv-job-head">
			<h3 className="cv-job-title">{job.title}</h3>
			<span
				className="cv-job-when"
				data-current={job.current ? "true" : "false"}
			>
				{job.when}
			</span>
		</div>
		<div className="cv-job-org">
			<a href={job.orgHref} target="_blank" rel="noreferrer">
				{job.org}
				<ArrowUpRight className="cv-ext" aria-hidden />
			</a>
			{" — "}
			{job.location}
			<span className="cv-duration">{job.duration}</span>
		</div>
		<ul className="cv-points">
			{job.points.map((point) => (
				<li className="cv-point" key={point.id}>
					{point.body}
				</li>
			))}
		</ul>
	</article>
);

const getInitialTheme = (): boolean =>
	typeof document !== "undefined" &&
	document.documentElement.dataset.theme === "dark";

export const App = () => {
	const shortcuts = useShortcutsHelp();
	const [darkMode, setDarkMode] = useState(getInitialTheme);
	const heroRef = useRef<HTMLElement>(null);
	const heroInView = useInView(heroRef);
	const linkCopy = useCopy(() => window.location.href, "CV link");

	useEffect(() => {
		const theme = darkMode ? "dark" : "light";
		document.documentElement.dataset.theme = theme;
		localStorage.setItem("chneau_cv_theme", theme);
	}, [darkMode]);

	// Keyboard shortcut: Esc to return to the dashboard, unless a menu, an
	// editable field or the shortcuts dialog already handled the key (the modal
	// manages its own Escape so this handler must not navigate away).
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (event.defaultPrevented) return;
			if (shortcuts.opened) return;
			const active = document.activeElement;
			if (
				active instanceof HTMLElement &&
				active.closest('[role="menu"], input, textarea, select')
			) {
				return;
			}
			window.location.href = "/";
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [shortcuts.opened]);

	return (
		<MantineProvider
			theme={cvTheme}
			forceColorScheme={darkMode ? "dark" : "light"}
		>
			<div className="cv-root">
				<div className="no-print">
					<Grain />
				</div>

				<AppHeader
					className="no-print"
					brand={
						<Brand
							href="/"
							icon={<span style={{ fontSize: 13, fontWeight: 700 }}>CN</span>}
							title="Charles Neau"
							subtitle="Curriculum Vitae"
						/>
					}
					actions={
						<>
							<BackHome label="Back to dashboard (Esc)" />
							<AppSwitcher />
							<HeaderAction
								iconOnly
								active={linkCopy.state === "ok"}
								label={linkCopy.title}
								onClick={linkCopy.copy}
								icon={
									linkCopy.state === "ok" ? (
										<Check size={16} />
									) : linkCopy.state === "error" ? (
										<TriangleAlert size={16} />
									) : (
										<Link2 size={16} />
									)
								}
							/>
							{linkCopy.feedback ? (
								<span
									className="cv-copy-feedback cv-copy-feedback--header"
									role="status"
									data-state={linkCopy.state}
								>
									{linkCopy.feedback}
								</span>
							) : null}
							<HeaderAction
								accent
								href="https://raw.githubusercontent.com/chneau/cv/master/cv.pdf"
								target="_blank"
								label="View or download the raw PDF from GitHub"
								icon={<FileText size={15} />}
							>
								PDF
							</HeaderAction>
							<HeaderAction
								href="https://raw.githubusercontent.com/chneau/cv/master/cv.docx"
								target="_blank"
								label="View or download the raw DOCX from GitHub"
								icon={<FileType size={15} />}
							>
								DOCX
							</HeaderAction>
							<HeaderAction
								iconOnly
								label="Print or save as PDF (Ctrl+P)"
								onClick={() => window.print()}
								icon={<Printer size={16} />}
							/>
							<ShortcutsHelpButton
								onClick={shortcuts.open}
								expanded={shortcuts.opened}
							/>
							<SchemeToggle
								dark={darkMode}
								onToggle={() => setDarkMode((value) => !value)}
							/>
						</>
					}
				/>

				<section className="cv-shell cv-hero" ref={heroRef}>
					<div data-reveal style={reveal(0)}>
						<span className="cv-eyebrow">Curriculum Vitae</span>
						<h1 className="cv-name">Charles Neau</h1>
						<p className="cv-role">Senior Full-Stack & Systems Engineer</p>
						<div className="cv-status">
							<a
								className="cv-status-item"
								href="https://maps.google.com/?q=Edinburgh,+UK"
								target="_blank"
								rel="noreferrer"
							>
								<span className="cv-status-dot" aria-hidden />
								Edinburgh, United Kingdom
							</a>
							<span className="cv-status-sep" aria-hidden />
							<span className="cv-status-item">
								<Clock aria-hidden />
								<LocalClock />
							</span>
						</div>
					</div>

					<ul
						className="cv-contact cv-contact-list"
						data-reveal
						style={reveal(1)}
					>
						{CONTACTS.map((contact) => (
							<li className="cv-contact-item" key={contact.label}>
								{contact.icon}
								<span className="cv-contact-label">{contact.label}</span>
								<a
									className="cv-contact-value"
									href={contact.href}
									{...(contact.external
										? { target: "_blank", rel: "noreferrer" }
										: {})}
								>
									{contact.value}
									{contact.external && (
										<ArrowUpRight className="cv-ext" aria-hidden />
									)}
								</a>
								{contact.copy && (
									<CopyButton text={contact.copy} label={contact.label} />
								)}
							</li>
						))}
					</ul>
				</section>

				<main className="cv-shell cv-main">
					<div className="cv-col cv-col--main">
						<section className="cv-section" data-reveal style={reveal(2)}>
							<div className="cv-section-head">
								<h2 className="cv-section-title">Summary</h2>
								<span className="cv-section-hint">10+ years</span>
							</div>
							<p className="cv-lead">
								Versatile, hands-on{" "}
								<strong>Senior Full-Stack & Systems Engineer</strong> with 10+
								years of experience engineering high-performance distributed
								platforms, discrete-event simulation & logistics optimization
								engines, and full-stack cloud-native web applications. Proven
								track record leading architecture and end-to-end delivery: from
								database tuning, GIS/routing algorithms, and real-time streaming
								to modern web UIs (React 19, TypeScript, Vite), Go/Bun
								microservices, Docker/Kubernetes infrastructure, CI/CD
								automation, and AI-accelerated workflows.
							</p>
						</section>

						<section className="cv-section" data-reveal style={reveal(3)}>
							<div className="cv-section-head">
								<h2 className="cv-section-title">Experience</h2>
								<span className="cv-section-hint">{JOBS.length} roles</span>
							</div>
							<div className="cv-timeline">
								{JOBS.map((job) => (
									<JobItem job={job} key={job.title} />
								))}
							</div>
						</section>

						<section className="cv-section" data-reveal style={reveal(4)}>
							<div className="cv-section-head">
								<h2 className="cv-section-title">Publication</h2>
								<span className="cv-section-hint">peer-reviewed</span>
							</div>
							<article className="cv-paper">
								<a
									className="cv-paper-title"
									href="https://ieeexplore.ieee.org/document/8477967"
									target="_blank"
									rel="noreferrer"
									title="View on IEEE Xplore"
								>
									An Analysis of Indirect Optimisation Strategies for Scheduling
									<ArrowUpRight className="cv-ext" aria-hidden />
								</a>
								<p className="cv-paper-authors">
									Charles Neau, Olivier Regnier-Coudert, and John McCall.
								</p>
								<p className="cv-paper-venue">
									IEEE World Congress on Computational Intelligence (IEEE WCCI
									2018)
								</p>
							</article>
						</section>
					</div>

					<aside className="cv-col cv-col--aside">
						<section className="cv-section" data-reveal style={reveal(5)}>
							<div className="cv-section-head">
								<h2 className="cv-section-title">Expertise</h2>
								<span className="cv-section-hint">{SKILLS.length} domains</span>
							</div>
							{SKILLS.map((group) => (
								<div className="cv-skill-group" key={group.category}>
									<h3 className="cv-skill-name">{group.category}</h3>
									<div className="cv-skill-tags">
										{group.items.map((item) => (
											<a
												className="cv-tag"
												key={item}
												href={getSkillSearchUrl(item)}
												target="_blank"
												rel="noreferrer"
												title={`Search "${item}" projects on GitHub`}
											>
												{item}
												<ArrowUpRight className="cv-ext" aria-hidden />
											</a>
										))}
									</div>
								</div>
							))}
						</section>

						<section className="cv-section" data-reveal style={reveal(6)}>
							<div className="cv-section-head">
								<h2 className="cv-section-title">Education</h2>
							</div>
							<div className="cv-edu-item">
								<div className="cv-edu-head">
									<p className="cv-edu-degree">
										Bachelor of Science in Computer Science (Software
										Development for Mobile Devices)
									</p>
									<span className="cv-edu-years">2013 – 2014</span>
								</div>
								<p className="cv-edu-school">
									<a href="https://www.uca.fr" target="_blank" rel="noreferrer">
										Université Blaise Pascal
										<ArrowUpRight className="cv-ext" aria-hidden />
									</a>
									, Clermont-Ferrand, France
								</p>
							</div>
							<div className="cv-edu-item">
								<div className="cv-edu-head">
									<p className="cv-edu-degree">
										Bachelor of Science in Computer Science
									</p>
									<span className="cv-edu-years">2011 – 2013</span>
								</div>
								<p className="cv-edu-school">
									<a href="https://iut.uca.fr" target="_blank" rel="noreferrer">
										IUT Clermont-Ferrand
										<ArrowUpRight className="cv-ext" aria-hidden />
									</a>
									, France
								</p>
							</div>
						</section>
					</aside>
				</main>

				<Footer
					className="no-print"
					left={
						<>
							<a href="/">Dashboard</a>
							<a
								href="https://raw.githubusercontent.com/chneau/cv/master/cv.pdf"
								target="_blank"
								rel="noreferrer"
							>
								Download PDF
							</a>
							<a
								href="https://raw.githubusercontent.com/chneau/cv/master/cv.docx"
								target="_blank"
								rel="noreferrer"
							>
								Download DOCX
							</a>
							<a
								href="https://github.com/chneau"
								target="_blank"
								rel="noreferrer"
							>
								<GithubMark />
								GitHub
							</a>
							<a
								href="https://linkedin.com/in/chneau"
								target="_blank"
								rel="noreferrer"
							>
								<LinkedinMark />
								LinkedIn
							</a>
						</>
					}
					right={BUILD_DATE ? `Built ${BUILD_DATE}` : undefined}
				/>

				<button
					type="button"
					className="cv-top no-print"
					data-visible={!heroInView}
					onClick={() =>
						window.scrollTo({
							top: 0,
							behavior: prefersReducedMotion() ? "auto" : "smooth",
						})
					}
					title="Back to top"
					aria-label="Back to top"
				>
					<ArrowUp aria-hidden />
				</button>
			</div>
			<ShortcutsHelp
				opened={shortcuts.opened}
				onClose={shortcuts.close}
				groups={[
					{
						title: "Page",
						shortcuts: [
							{ keys: ["Esc"], description: "Return to the dashboard" },
						],
					},
				]}
			/>
		</MantineProvider>
	);
};
