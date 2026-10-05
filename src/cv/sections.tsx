import {
	ArrowUp,
	ArrowUpRight,
	Check,
	Clock,
	Copy,
	FileText,
	FileType,
	Link2,
	Printer,
	TriangleAlert,
} from "lucide-react";
import type { CSSProperties } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { HeaderAction, prefersReducedMotion } from "../shared";
import { GithubMark, LinkedinMark } from "./brand-marks";
import {
	CONTACTS,
	DOCX_URL,
	JOBS,
	type Job,
	PDF_URL,
	SKILLS,
	skillSearchUrl,
} from "./content";
import type { HeroVisibility } from "./hero-visibility";

/**
 * The CV's body, one component per section of the document.
 *
 * The split is the document's own: hero and contacts, then the two columns of
 * experience and expertise. Each section carries its own `data-reveal` index,
 * so the entrance order is still read top-to-bottom through the two columns
 * rather than restarted by the split.
 */

/**
 * The staggered-entrance index. It is a number and not a class because the
 * print rules in `cv.css` reset `[data-reveal]` by selector, and the index only
 * has to survive into the cascade — not carry meaning of its own.
 */
const reveal = (index: number): CSSProperties =>
	({ "--reveal-i": index }) as CSSProperties;

/** Announces that a `target="_blank"` link opens in a new tab. */
const NewTabHint = () => <span className="sr-only">(opens in new tab)</span>;

type CopyState = "idle" | "ok" | "error";

const copyToClipboard = async (text: string): Promise<void> => {
	if (navigator.clipboard) {
		await navigator.clipboard.writeText(text);
		return;
	}
	// `navigator.clipboard` is absent outside a secure context, and a CV read
	// over plain HTTP is a supported way to arrive here.
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

/**
 * Copy with a transient confirmation. The text is fetched through a callback
 * rather than captured, so the same hook serves a constant string and
 * `window.location.href` without either being read during render.
 */
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

/**
 * A copy button plus its live-region feedback. The region sits next to the
 * button rather than inside it so the confirmation is announced once, by one
 * element, whether the copy succeeded or failed.
 */
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

const LONDON_TIME = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
	timeZoneName: "short",
});

/**
 * The local time in the hero. Memoised because it ticks on a timer of its own
 * and must not re-render the hero — and everything the hero contains — twice a
 * minute.
 */
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

/** One role in the timeline, with its achievements as a list. */
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

/** The contact list in the hero: each row a value, and a copy where it helps. */
const ContactList = () => (
	<ul className="cv-contact cv-contact-list" data-reveal style={reveal(1)}>
		{CONTACTS.map((contact) => (
			<li className="cv-contact-item" key={contact.label}>
				{contact.icon}
				<span className="cv-contact-label">{contact.label}</span>
				<a
					className="cv-contact-value"
					href={contact.href}
					{...(contact.external ? { target: "_blank", rel: "noreferrer" } : {})}
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
);

/**
 * The page's opening block: name, role, where he is, and how to reach him. It
 * carries the ref the back-to-top button watches, because that ref has to point
 * at this element and nowhere else.
 */
export const Hero = ({ heroRef }: { heroRef: HeroVisibility["heroRef"] }) => (
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

		<ContactList />
	</section>
);

/** Expertise: one group of tags per domain, each linking to matching projects. */
const Expertise = () => (
	<section className="cv-section" data-reveal style={reveal(5)}>
		<div className="cv-section-head">
			<h2 className="cv-section-title">Expertise</h2>
			<span className="cv-section-hint">{SKILLS.length} domains</span>
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
);

const EducationItem = ({
	degree,
	years,
	school,
	href,
	location,
}: {
	degree: string;
	years: string;
	school: string;
	href: string;
	location: string;
}) => (
	<div className="cv-edu-item">
		<div className="cv-edu-head">
			<p className="cv-edu-degree">{degree}</p>
			<span className="cv-edu-years">{years}</span>
		</div>
		<p className="cv-edu-school">
			<a href={href} target="_blank" rel="noreferrer">
				{school}
				<ArrowUpRight className="cv-ext" aria-hidden />
				<NewTabHint />
			</a>
			, {location}
		</p>
	</div>
);

/** Education. Two degrees, newest first. */
const Education = () => (
	<section className="cv-section" data-reveal style={reveal(6)}>
		<div className="cv-section-head">
			<h2 className="cv-section-title">Education</h2>
		</div>
		<EducationItem
			degree="Bachelor of Science in Computer Science (Software Development for Mobile Devices)"
			years="2013 – 2014"
			school="Université Blaise Pascal"
			href="https://www.uca.fr"
			location="Clermont-Ferrand, France"
		/>
		<EducationItem
			degree="Bachelor of Science in Computer Science"
			years="2011 – 2013"
			school="IUT Clermont-Ferrand"
			href="https://iut.uca.fr"
			location="France"
		/>
	</section>
);

/** The one-paragraph summary. */
const Summary = () => (
	<section className="cv-section" data-reveal style={reveal(2)}>
		<div className="cv-section-head">
			<h2 className="cv-section-title">Summary</h2>
			<span className="cv-section-hint">10+ years</span>
		</div>
		<p className="cv-lead">
			Versatile, hands-on <strong>Senior Full-Stack & Systems Engineer</strong>{" "}
			with 10+ years of experience engineering high-performance distributed
			platforms, discrete-event simulation & logistics optimisation engines, and
			full-stack cloud-native web applications. Proven track record leading
			architecture and end-to-end delivery: from database tuning, GIS/routing
			algorithms, and real-time streaming to modern web UIs (React 19,
			TypeScript, Vite), Go/Bun microservices, Docker/Kubernetes infrastructure,
			CI/CD automation, and AI-accelerated workflows.
		</p>
	</section>
);

/** The career timeline, newest role first. */
const Experience = () => (
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
);

/** The peer-reviewed paper. */
const Publication = () => (
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
				<NewTabHint />
			</a>
			<p className="cv-paper-authors">
				Charles Neau, Olivier Regnier-Coudert, and John McCall.
			</p>
			<p className="cv-paper-venue">
				IEEE World Congress on Computational Intelligence (IEEE WCCI 2018)
			</p>
		</article>
	</section>
);

/** The right-hand column: summary, experience, then the publication. */
const MainColumn = () => (
	<div className="cv-col cv-col--main">
		<Summary />
		<Experience />
		<Publication />
	</div>
);

/** The left-hand column: expertise, then education. */
const AsideColumn = () => (
	<aside className="cv-col cv-col--aside">
		<Expertise />
		<Education />
	</aside>
);

/** The two columns of the document body, in reading order. */
export const Body = () => (
	<div className="cv-shell cv-main">
		<AsideColumn />
		<MainColumn />
	</div>
);

/**
 * The five header controls. All of them are `no-print` in effect: the print
 * rules hide the bar itself, so the copy feedback span is the one that has to
 * carry its own class to stay out of the paper.
 */
export const HeaderActions = () => {
	const linkCopy = useCopy(() => window.location.href, "CV link");

	return (
		<>
			<HeaderAction
				iconOnly
				active={linkCopy.state === "ok"}
				label={linkCopy.title}
				menuLabel="Copy a link to this CV"
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
				menuLabel="Print or save as PDF"
				onClick={() => window.print()}
				icon={<Printer size={16} />}
			/>
		</>
	);
};

/** The footer's outbound links: the dashboard and the two exports. */
export const FooterLinks = () => (
	<>
		<a href="/">Dashboard</a>
		<a href={PDF_URL} target="_blank" rel="noreferrer">
			Download PDF
		</a>
		<a href={DOCX_URL} target="_blank" rel="noreferrer">
			Download DOCX
		</a>
		<a href="https://github.com/chneau" target="_blank" rel="noreferrer">
			<GithubMark />
			GitHub
		</a>
		<a href="https://linkedin.com/in/chneau" target="_blank" rel="noreferrer">
			<LinkedinMark />
			LinkedIn
		</a>
	</>
);

/**
 * The floating back-to-top control. It appears only once the hero has left the
 * viewport, and it respects `prefers-reduced-motion` because a smooth scroll is
 * exactly the kind of large motion the preference exists to stop.
 */
export const BackToTop = ({ heroInView }: { heroInView: boolean }) => (
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
);
