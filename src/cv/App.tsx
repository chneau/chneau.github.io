import { type MantineColorsTuple, MantineProvider } from "@mantine/core";
import {
	ArrowUp,
	ArrowUpRight,
	Check,
	Clock,
	Copy,
	FileText,
	FileType,
	Keyboard,
	Link2,
	Moon,
	Printer,
	Sun,
	TriangleAlert,
} from "lucide-react";
import type { CSSProperties, RefObject } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
	AppHeader,
	AppSwitcher,
	BackHome,
	Brand,
	type Command,
	CommandPalette,
	createAppTheme,
	Footer,
	Grain,
	HeaderAction,
	prefersReducedMotion,
	SchemeToggle,
	ShortcutsHelp,
	ShortcutsHelpButton,
	SkipLink,
	useCommandPalette,
	useShortcutsHelp,
	useThemeMode,
} from "../shared";
import {
	CONTACTS,
	DOCX_URL,
	GithubMark,
	JOBS,
	type Job,
	LinkedinMark,
	PDF_URL,
	SKILLS,
	skillSearchUrl,
} from "./content";
import { CV_THEME_KEY } from "./theme";

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

const reveal = (index: number): CSSProperties =>
	({ "--reveal-i": index }) as CSSProperties;

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

/** Announces that a `target="_blank"` link opens in a new tab. */
const NewTabHint = () => <span className="sr-only"> (opens in new tab)</span>;

const LONDON_TIME = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
	timeZoneName: "short",
});

const LocalClock = memo(function LocalClock() {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		// Only HH:MM is shown; a 30s tick stays current without churning.
		const id = window.setInterval(() => setNow(new Date()), 30_000);
		return () => window.clearInterval(id);
	}, []);

	const parts = LONDON_TIME.formatToParts(now);

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
				<NewTabHint />
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

export const App = () => {
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();
	const theme = useThemeMode(CV_THEME_KEY);
	const heroRef = useRef<HTMLElement>(null);
	const heroInView = useInView(heroRef);
	const linkCopy = useCopy(() => window.location.href, "CV link");

	// Keyboard shortcut: Esc returns to the dashboard, but never while a dialog
	// or an interactive control already handles the key. Mantine closes its
	// modals without `preventDefault`, so the palette/listbox must be guarded
	// too or keyboard users get ejected from the page.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (event.defaultPrevented) return;
			if (shortcuts.opened || palette.opened) return;
			const active = document.activeElement;
			if (
				active instanceof HTMLElement &&
				active.closest(
					'[role="menu"], [role="listbox"], [role="option"], input, textarea, select, button, a[href]',
				)
			) {
				return;
			}
			window.location.href = "/";
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [shortcuts.opened, palette.opened]);

	const commands: Command[] = [
		{
			id: "toggle-theme",
			label: "Toggle light / dark theme",
			hint: "Theme",
			icon: theme.dark ? <Sun size={16} /> : <Moon size={16} />,
			run: theme.toggle,
		},
		{
			id: "keyboard-shortcuts",
			label: "Keyboard shortcuts",
			hint: "Help",
			icon: <Keyboard size={16} />,
			run: shortcuts.open,
		},
		{
			id: "download-pdf",
			label: "Download PDF",
			hint: "Export",
			keywords: "cv resume export",
			icon: <FileText size={16} />,
			run: () => window.open(PDF_URL, "_blank", "noopener,noreferrer"),
		},
		{
			id: "download-docx",
			label: "Download DOCX",
			hint: "Export",
			keywords: "cv resume word export",
			icon: <FileType size={16} />,
			run: () => window.open(DOCX_URL, "_blank", "noopener,noreferrer"),
		},
	];

	return (
		<MantineProvider
			theme={cvTheme}
			forceColorScheme={theme.dark ? "dark" : "light"}
		>
			<SkipLink />
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
								href={PDF_URL}
								target="_blank"
								label="View or download the raw PDF from GitHub"
								icon={<FileText size={15} />}
							>
								PDF
							</HeaderAction>
							<HeaderAction
								href={DOCX_URL}
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
							<SchemeToggle dark={theme.dark} onToggle={theme.toggle} />
						</>
					}
				/>

				<main id="main" tabIndex={-1}>
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
									<NewTabHint />
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
											<>
												<ArrowUpRight className="cv-ext" aria-hidden />
												<NewTabHint />
											</>
										)}
									</a>
									{contact.copy && (
										<CopyButton text={contact.copy} label={contact.label} />
									)}
								</li>
							))}
						</ul>
					</section>

					<div className="cv-shell cv-main">
						<aside className="cv-col cv-col--aside">
							<section className="cv-section" data-reveal style={reveal(5)}>
								<div className="cv-section-head">
									<h2 className="cv-section-title">Expertise</h2>
									<span className="cv-section-hint">
										{SKILLS.length} domains
									</span>
								</div>
								{SKILLS.map((group) => (
									<div className="cv-skill-group" key={group.category}>
										<h3 className="cv-skill-name">{group.category}</h3>
										<ul className="cv-skill-tags">
											{group.items.map((item) => (
												<li key={item}>
													<a
														className="cv-tag"
														href={skillSearchUrl(item)}
														target="_blank"
														rel="noreferrer"
														title={`Search "${item}" projects on GitHub`}
													>
														{item}
														<ArrowUpRight className="cv-ext" aria-hidden />
														<NewTabHint />
													</a>
												</li>
											))}
										</ul>
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
										<a
											href="https://www.uca.fr"
											target="_blank"
											rel="noreferrer"
										>
											Université Blaise Pascal
											<ArrowUpRight className="cv-ext" aria-hidden />
											<NewTabHint />
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
										<a
											href="https://iut.uca.fr"
											target="_blank"
											rel="noreferrer"
										>
											IUT Clermont-Ferrand
											<ArrowUpRight className="cv-ext" aria-hidden />
											<NewTabHint />
										</a>
										, France
									</p>
								</div>
							</section>
						</aside>

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
									track record leading architecture and end-to-end delivery:
									from database tuning, GIS/routing algorithms, and real-time
									streaming to modern web UIs (React 19, TypeScript, Vite),
									Go/Bun microservices, Docker/Kubernetes infrastructure, CI/CD
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
										An Analysis of Indirect Optimisation Strategies for
										Scheduling
										<ArrowUpRight className="cv-ext" aria-hidden />
										<NewTabHint />
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
					</div>
				</main>

				<Footer
					className="no-print"
					left={
						<>
							<a href="/">Dashboard</a>
							<a href={PDF_URL} target="_blank" rel="noreferrer">
								Download PDF
							</a>
							<a href={DOCX_URL} target="_blank" rel="noreferrer">
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
			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
