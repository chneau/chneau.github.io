import { composite, parseColor, type Rgba, ratio } from "../shared/colour";
import { TOKEN_DEFS } from "./tokens";

/* ══════════════════════════════════════════════════════════════════════
   Audit
   ══════════════════════════════════════════════════════════════════════ */

/**
 * The gallery audits itself.
 *
 * Everything below reads the *live document* — computed custom properties and
 * real rendered elements — rather than a copy of the token values. That is the
 * whole point: a gallery that re-declares the system in TypeScript can only
 * ever prove that TypeScript is internally consistent, while the failure this
 * panel exists to catch (an undefined `--app-accent` quietly falling back to
 * the body text colour) is invisible to every type and every unit test.
 *
 * The sweep runs once per scheme change, from a single animation frame so the
 * first paint has settled, and never during render.
 */

/** Root background used to terminate a compositing walk on an opaque layer. */
const CANVAS: Record<"light" | "dark", Rgba> = {
	light: [255, 255, 255, 1],
	dark: [9, 9, 11, 1],
};

/*
 * The colour maths — `parseColor`, `composite`, `luminance` and `ratio` — now
 * lives in `shared/colour.ts` so the audit and the contrast suite cannot drift
 * apart. `CANVAS` stays here: it is the document's root backdrop, not part of
 * the pure colour algebra.
 */

const rootStyle = (): CSSStyleDeclaration =>
	getComputedStyle(document.documentElement);

/** Resolved value of one custom property on `<html>`, or `""` when undefined. */
const readToken = (name: string): string =>
	rootStyle().getPropertyValue(name).trim();

/** Resolved value of a custom property as a colour, or `undefined`. */
const readColourToken = (name: string): Rgba | undefined => {
	const raw = readToken(name);
	return raw === "" ? undefined : parseColor(raw);
};

type Level = "fail" | "pass";
type AuditGroup = "tokens" | "contrast" | "focus" | "motion" | "document";

export type Finding = {
	/** Stable React key and dedupe key. */
	id: string;
	group: AuditGroup;
	level: Level;
	subject: string;
	detail: string;
	/**
	 * True when the thing that is wrong comes from the shared layer rather than
	 * from this page. The gallery does not paper over a shared defect, and it
	 * does not want to be blamed for one either.
	 */
	shared: boolean;
};

/**
 * The site-provided half of the accent family. `--app-accent` is required:
 * `base.css` reads it with a body-text fallback in the `:focus-visible` ring
 * and in `StatusDot --on`, so an undefined value is silent, not loud. The rest
 * are read only behind a `--mantine-primary-color-*` value Mantine always
 * emits, so they are reported for completeness but are not failures.
 */
export const SITE_ACCENT: readonly { name: string; required: boolean }[] = [
	{ name: "--app-accent", required: true },
	{ name: "--app-accent-hover", required: false },
	{ name: "--app-accent-ink", required: false },
	{ name: "--app-accent-line", required: false },
	{ name: "--app-accent-soft", required: false },
];

/** Mantine variables the shared layer reads with an app fallback. */
export const MANTINE_ACCENT: readonly string[] = [
	"--mantine-primary-color-filled",
	"--mantine-primary-color-filled-hover",
	"--mantine-primary-color-light",
	"--mantine-primary-color-light-hover",
	"--mantine-primary-color-light-color",
	"--mantine-primary-color-contrast",
];

/**
 * Foreground/background pairs the shared layer actually composes, with the
 * threshold that applies to each. `3` is the non-text threshold (WCAG 1.4.11):
 * it governs the focus ring, the status lights and the icon-only affordances.
 * `4.5` governs body copy.
 */
const CONTRAST_PAIRS: readonly {
	label: string;
	foreground: string;
	background: string;
	need: 3 | 4.5;
}[] = [
	{
		label: "Body text on page",
		foreground: "--app-text",
		background: "--app-bg",
		need: 4.5,
	},
	{
		label: "Body text on card",
		foreground: "--app-text",
		background: "--app-surface",
		need: 4.5,
	},
	{
		label: "Muted text on page",
		foreground: "--app-text-muted",
		background: "--app-bg",
		need: 4.5,
	},
	{
		label: "Muted text on raised surface",
		foreground: "--app-text-muted",
		background: "--app-surface-2",
		need: 4.5,
	},
	{
		label: "Faint text on page",
		foreground: "--app-text-faint",
		background: "--app-bg",
		need: 4.5,
	},
	{
		label: "Faint text on card",
		foreground: "--app-text-faint",
		background: "--app-surface",
		need: 4.5,
	},
	{
		label: "Faint text on sunken surface",
		foreground: "--app-text-faint",
		background: "--app-surface-3",
		need: 4.5,
	},
	{
		label: "Danger on page",
		foreground: "--app-danger",
		background: "--app-bg",
		need: 4.5,
	},
	// `--app-warn` only ever paints the pinned-card icon, which is a non-text
	// affordance, so 1.4.11's 3:1 is the threshold that applies to it.
	{
		label: "Warning pin on card",
		foreground: "--app-warn",
		background: "--app-surface",
		need: 3,
	},
	{
		label: "Accent on page",
		foreground: "--app-accent",
		background: "--app-bg",
		need: 3,
	},
	{
		label: "Accent on card",
		foreground: "--app-accent",
		background: "--app-surface",
		need: 3,
	},
	{
		label: "Accent on raised surface",
		foreground: "--app-accent",
		background: "--app-surface-2",
		need: 3,
	},
	{
		label: "Filled accent label",
		foreground: "--mantine-primary-color-contrast",
		background: "--mantine-primary-color-filled",
		need: 4.5,
	},
];

/** Every text token that must be defined for the page to be readable. */
const REQUIRED_TOKENS: readonly string[] = [
	...TOKEN_DEFS.map((token) => token.name),
	"--app-accent",
];

/* ── Document sweep ──────────────────────────────────────────────────── */

/** True when the element, or an ancestor, is styled by the shared layer. */
const isSharedLayer = (element: Element): boolean => {
	const own = element.getAttribute("class") ?? "";
	if (/(^|\s)app-/.test(own) || /(^|\s)mantine-/.test(own)) return true;
	const parent = element.parentElement;
	return parent ? isSharedLayer(parent) : false;
};

/** Backdrop actually visible behind `element`, compositing translucent layers. */
const backdropOf = (element: Element, canvas: Rgba): Rgba => {
	const stack: Rgba[] = [];
	let node: Element | null = element;
	while (node) {
		const colour = parseColor(getComputedStyle(node).backgroundColor);
		if (colour && colour[3] > 0) {
			stack.push(colour);
			if (colour[3] === 1) break;
		}
		node = node.parentElement;
	}
	let acc = canvas;
	for (let i = stack.length - 1; i >= 0; i -= 1) {
		acc = composite(stack[i] ?? acc, acc);
	}
	return acc;
};

/** Text this element renders itself, ignoring nested elements' text. */
const ownText = (element: Element): string => {
	let text = "";
	for (const node of Array.from(element.childNodes)) {
		if (node.nodeType === 3) text += node.textContent ?? "";
	}
	return text.trim();
};

const isRendered = (element: Element): boolean => {
	const style = getComputedStyle(element);
	if (style.display === "none" || style.visibility === "hidden") return false;
	if (Number.parseFloat(style.opacity) === 0) return false;
	return element.getClientRects().length > 0;
};

/**
 * Walk every rendered text node and check it against its composited backdrop.
 *
 * Deliberately does not skip failures: an `AppCard` badge that cannot be read
 * is the gallery doing its job, and the finding is attributed to the shared
 * layer so the report below can say where to fix it.
 */
const sweepDocument = (canvas: Rgba): Finding[] => {
	const findings: Finding[] = [];
	const seen = new Set<string>();

	for (const element of Array.from(document.body.querySelectorAll("*"))) {
		// The audit never reports on its own output.
		if (element.closest("[data-design-audit]")) continue;
		if (!isRendered(element)) continue;
		const text = ownText(element);
		if (text === "") continue;

		const style = getComputedStyle(element);
		const foreground = parseColor(style.color);
		if (!foreground) continue;
		const backdrop = backdropOf(element, canvas);
		const measured = ratio(composite(foreground, backdrop), backdrop);

		const size = Number.parseFloat(style.fontSize);
		const weight = Number.parseInt(style.fontWeight, 10) || 400;
		const large = size >= 24 || (size >= 18.66 && weight >= 700);
		const need = large ? 3 : 4.5;

		const classes = element.getAttribute("class") ?? "";
		const signature = `${style.color}|${backdrop
			.map((c) => Math.round(c))
			.join(",")}|${size}|${weight}|${measured.toFixed(2)}`;
		if (seen.has(signature)) continue;
		seen.add(signature);

		if (measured >= need) continue;

		const tag = element.tagName.toLowerCase();
		const label = classes
			? `.${classes.trim().split(/\s+/).slice(0, 2).join(".")}`
			: tag;
		findings.push({
			id: `doc:${label}:${signature}`,
			group: "document",
			level: "fail",
			subject: `${label} — “${text.slice(0, 34)}${
				text.length > 34 ? "…" : ""
			}”`,
			detail: `${measured.toFixed(
				2,
			)}:1, needs ${need}:1 · ${style.color} on rgb(${backdrop
				.slice(0, 3)
				.map((c) => Math.round(c))
				.join(", ")}) · ${size}px/${weight}`,
			shared: isSharedLayer(element),
		});
	}

	return findings;
};

/* ── Focus ring probe ────────────────────────────────────────────────── */

const FOCUS_PROBE_CLASS = "design-probe";

/**
 * Read the ring the browser actually paints for `:focus-visible`.
 *
 * The failure this guards against is specific: when `--app-accent` is missing,
 * `outline: 2px solid var(--app-accent, var(--app-text))` is still a *valid*
 * 2px outline — it is just the colour of the body text, so the ring is present
 * in every automated check and invisible in use. The only way to see that is to
 * focus a real element and read the resolved outline colour back.
 */
const probeFocusRing = (scheme: "light" | "dark"): Finding[] => {
	const findings: Finding[] = [];
	const probe = document.createElement("a");
	probe.className = FOCUS_PROBE_CLASS;
	probe.href = `#${scheme}`;
	probe.textContent = "focus probe";
	document.body.appendChild(probe);
	probe.focus();

	const style = getComputedStyle(probe);
	const outline = parseColor(style.outlineColor);
	const width = Number.parseFloat(style.outlineWidth);
	probe.remove();

	if (style.outlineStyle === "none" || Number.isNaN(width) || width < 1) {
		findings.push({
			id: "focus:width",
			group: "focus",
			level: "fail",
			subject: "Keyboard focus ring is not drawn",
			detail: `outline: ${style.outlineStyle} ${style.outlineWidth}`,
			shared: true,
		});
		return findings;
	}

	const backdrop = parseColor(readToken("--app-bg")) ?? CANVAS[scheme];
	const bodyText = parseColor(readToken("--app-text"));
	const measured = outline ? ratio(outline, backdrop) : 0;

	findings.push({
		id: "focus:contrast",
		group: "focus",
		level: measured >= 3 ? "pass" : "fail",
		subject: "Focus ring against the page background",
		detail: `${measured.toFixed(
			2,
		)}:1, needs 3:1 · outline ${style.outlineColor} on ${readToken("--app-bg")}`,
		shared: true,
	});

	// The exact regression: accent silently resolving to the body text colour.
	const collapsed =
		outline !== undefined &&
		bodyText !== undefined &&
		Math.abs(outline[0] - bodyText[0]) < 0.5 &&
		Math.abs(outline[1] - bodyText[1]) < 0.5 &&
		Math.abs(outline[2] - bodyText[2]) < 0.5;

	findings.push({
		id: "focus:not-text",
		group: "focus",
		level: collapsed ? "fail" : "pass",
		subject: collapsed
			? "Focus ring has collapsed onto the body text colour"
			: "Focus ring is distinct from the body text colour",
		detail: collapsed
			? "var(--app-accent) is undefined; base.css fell back to var(--app-text)"
			: `outline ${style.outlineColor} vs --app-text ${readToken(
					"--app-text",
				)}`,
		shared: true,
	});

	return findings;
};

/* ── Token checks ────────────────────────────────────────────────────── */

const auditTokens = (): Finding[] => {
	const findings: Finding[] = [];

	for (const name of REQUIRED_TOKENS) {
		const value = readToken(name);
		findings.push({
			id: `token:${name}`,
			group: "tokens",
			level: value === "" ? "fail" : "pass",
			subject: name,
			detail: value === "" ? "undefined" : value,
			shared: !name.startsWith("--mantine-"),
		});
	}

	for (const { name, required } of SITE_ACCENT) {
		if (REQUIRED_TOKENS.includes(name)) continue;
		const value = readToken(name);
		findings.push({
			id: `accent:${name}`,
			group: "tokens",
			level: value === "" && required ? "fail" : "pass",
			subject: name,
			detail:
				value === ""
					? "not defined — optional, base.css falls through to --mantine-primary-color-*"
					: value,
			shared: false,
		});
	}

	for (const name of MANTINE_ACCENT) {
		const value = readToken(name);
		findings.push({
			id: `mantine:${name}`,
			group: "tokens",
			level: value === "" ? "fail" : "pass",
			subject: name,
			detail: value === "" ? "undefined" : value,
			shared: false,
		});
	}

	// `--app-index` is set per element by `AppCard`, not on the root.
	const card = document.querySelector<HTMLElement>(".app-card");
	const index = card?.style.getPropertyValue("--app-index") ?? "";
	findings.push({
		id: "token:--app-index",
		group: "tokens",
		level: index === "" ? "fail" : "pass",
		subject: "--app-index",
		detail:
			index === ""
				? "not set on the first .app-card; .app-rise will not stagger"
				: `set to ${index} on the first .app-card`,
		shared: true,
	});

	return findings;
};

/* ── Contrast pairs ──────────────────────────────────────────────────── */

const auditContrast = (): Finding[] =>
	CONTRAST_PAIRS.map((pair) => {
		const foreground = readColourToken(pair.foreground);
		const background = readColourToken(pair.background);

		if (!foreground || !background) {
			return {
				id: `contrast:${pair.label}`,
				group: "contrast" as const,
				level: "fail" as const,
				subject: pair.label,
				detail: `cannot resolve ${
					!foreground ? pair.foreground : pair.background
				}`,
				shared: !pair.foreground.startsWith("--mantine-"),
			};
		}

		const measured = ratio(composite(foreground, background), background);
		return {
			id: `contrast:${pair.label}`,
			group: "contrast" as const,
			level: (measured >= pair.need ? "pass" : "fail") as Level,
			subject: pair.label,
			detail: `${measured.toFixed(
				2,
			)}:1, needs ${pair.need}:1 · ${pair.foreground} on ${pair.background}`,
			shared: !pair.foreground.startsWith("--mantine-"),
		};
	});

/**
 * Mantine resolves a filled button's ink in JavaScript, at style time, from the
 * *light* primary shade — `defaultVariantColorsResolver` calls
 * `parseThemeColor({ color, theme })` with no `colorScheme`, and
 * `parseThemeColor` falls back to `getPrimaryShade(theme, 'light')`.
 *
 * The consequence is that `--mantine-primary-color-contrast` (which *is*
 * scheme-aware, and correctly returns `#000` in dark here) and the ink Mantine
 * actually paints on `<Button variant="filled">` disagree whenever the dark
 * primary shade is light enough to want dark text. The background comes from a
 * live CSS variable, so it tracks the scheme; the text colour does not.
 *
 * This check compares the two so the failure is reported with its cause rather
 * than as an anonymous "1.99:1 on the Filled button".
 */
const auditButtonInk = (): Finding[] => {
	/*
	 * Identify the filled button by what it actually paints, not by a variant
	 * prop: its background is the resolved `--mantine-primary-color-filled`.
	 * A `variant="default"` or `variant="light"` button in the same section has
	 * a different background and would silently be measured instead.
	 */
	const filled = readColourToken("--mantine-primary-color-filled");
	const variable = readColourToken("--mantine-primary-color-contrast");

	const button = Array.from(
		document.querySelectorAll<HTMLElement>(".mantine-Button-root"),
	).find((element) => {
		const background = parseColor(getComputedStyle(element).backgroundColor);
		return (
			filled !== undefined &&
			background !== undefined &&
			background[3] === 1 &&
			Math.abs(background[0] - filled[0]) < 0.5 &&
			Math.abs(background[1] - filled[1]) < 0.5 &&
			Math.abs(background[2] - filled[2]) < 0.5
		);
	});

	if (!button) {
		return [
			{
				id: "contrast:button-ink",
				group: "contrast",
				level: "fail",
				subject: "Filled button ink",
				detail: "no button painting the filled accent was found to measure",
				shared: false,
			},
		];
	}

	const style = getComputedStyle(button);
	const painted = parseColor(style.color);
	const background = parseColor(style.backgroundColor);

	if (!painted || !variable || !background) {
		return [
			{
				id: "contrast:button-ink",
				group: "contrast",
				level: "fail",
				subject: "Filled button ink",
				detail:
					"could not resolve the button's colour, background or the contrast token",
				shared: false,
			},
		];
	}

	const measured = ratio(composite(painted, background), background);
	const same =
		Math.abs(painted[0] - variable[0]) < 0.5 &&
		Math.abs(painted[1] - variable[1]) < 0.5 &&
		Math.abs(painted[2] - variable[2]) < 0.5;

	return [
		{
			id: "contrast:button-ink",
			group: "contrast",
			level: measured >= 4.5 ? "pass" : "fail",
			subject: "Filled button label",
			detail: `${measured.toFixed(
				2,
			)}:1, needs 4.5:1 · ${style.color} on ${style.backgroundColor}`,
			shared: false,
		},
		{
			id: "contrast:button-ink-agrees",
			group: "contrast",
			level: same ? "pass" : "fail",
			subject: same
				? "Button ink agrees with --mantine-primary-color-contrast"
				: "Button ink disagrees with --mantine-primary-color-contrast",
			detail: same
				? `both ${style.color}`
				: `paints ${style.color}, but the token resolves to ${readToken(
						"--mantine-primary-color-contrast",
					)} — Mantine resolves button ink from the light primary shade, so it does not follow the scheme`,
			shared: false,
		},
	];
};

/* ── Reduced motion ──────────────────────────────────────────────────── */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * How long to wait for the scheme transition before measuring. Comfortably
 * longer than `--app-speed` (0.28s) so the backstop only fires when nothing
 * emitted a `transitionend` — for instance when the visitor has
 * `prefers-reduced-motion` set and every duration collapses to ~0.
 */
export const AUDIT_SETTLE_MS = 600;

/**
 * Check that the shared `prefers-reduced-motion` reset actually reaches the
 * motion this page declares.
 *
 * `shared/motion.ts` warns that an inline `transition` style outranks every
 * author rule, including that reset — so a gallery that demonstrated motion
 * with `style={{ transition }}` would be shipping the very bug the reset
 * exists to prevent, while looking correct in every other respect. The probe
 * element here is driven by a class, so the measurement is meaningful.
 */
const auditMotion = (): Finding[] => {
	const findings: Finding[] = [];
	const reduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;

	findings.push({
		id: "motion:state",
		group: "motion",
		level: "pass",
		subject: "prefers-reduced-motion",
		detail: reduced
			? "reduce — the visitor asked for less motion"
			: "no-preference",
		shared: false,
	});

	/*
	 * Sweep the whole document rather than probing one element.
	 *
	 * A single probe answers the wrong question. The interesting failure is not
	 * "does this one element animate" but "does the *global* reset actually
	 * neutralise anything", and that can only be answered across every element
	 * that declares a duration.
	 *
	 * This is where the sweep earns its keep. `base.css` ends with
	 *
	 *   @media (prefers-reduced-motion: reduce) { *, *::before, *::after {
	 *     transition-duration: .001ms !important; … } }
	 *
	 * and the `!important` is what makes it work. A `*` selector has specificity
	 * (0,0,0) and a media query contributes none, so without it every class rule
	 * that declares its own duration — `.app-header-action`, `.app-card`,
	 * `.app-skip-link`, `.app-statusdot` — wins outright and the guard protects
	 * nothing. Measured before `!important` was added here: 14 elements still
	 * animated under `reduce`. The comment in `base.css` records that, and
	 * `shared/tests/motion.test.ts` plus `tokens-theme.test.ts` hold the
	 * declarations in place.
	 *
	 * This note used to say the reset was inert and described the pre-fix state.
	 * The sweep below was always right — it measures what actually animates — but
	 * the prose sent the next reader to look for a non-problem.
	 */
	const offenders = new Map<string, { count: number; sample: string }>();

	for (const element of Array.from(document.body.querySelectorAll("*"))) {
		if (element.closest("[data-design-audit]")) continue;
		if (!isRendered(element)) continue;
		const style = getComputedStyle(element);
		const transition = Number.parseFloat(style.transitionDuration);
		const animation = Number.parseFloat(style.animationDuration);
		const moving =
			(!Number.isNaN(transition) && transition > 0.005) ||
			(!Number.isNaN(animation) && animation > 0.005);
		if (!moving) continue;

		const classes = (element.getAttribute("class") ?? "")
			.trim()
			.split(/\s+/)
			.filter(
				(name) =>
					name && !name.startsWith("m_") && !name.startsWith("mantine-"),
			)
			.slice(0, 2)
			.join(".");
		const label = classes ? `.${classes}` : element.tagName.toLowerCase();
		const existing = offenders.get(label);
		if (existing) existing.count += 1;
		else {
			offenders.set(label, {
				count: 1,
				sample: `transition ${style.transitionDuration} · animation ${style.animationDuration} (${style.animationIterationCount}×)`,
			});
		}
	}

	const moving = [...offenders.entries()];

	findings.push({
		id: "motion:reset",
		group: "motion",
		level: reduced === (moving.length === 0) ? "pass" : "fail",
		subject: reduced
			? moving.length === 0
				? "Global reduced-motion reset reaches every element"
				: `Global reduced-motion reset misses ${moving.length} selector${
						moving.length === 1 ? "" : "s"
					}`
			: moving.length === 0
				? "Nothing animates, so there is nothing to reset"
				: `${moving.length} selectors animate`,
		detail: reduced
			? moving.length === 0
				? "every transition and animation computes to ~0s"
				: `base.css resets with a \`*\` selector (specificity 0,0,0); a media query adds none, so any class rule declaring its own duration wins. Still moving: ${moving
						.slice(0, 4)
						.map(([name, info]) => `${name} ×${info.count} (${info.sample})`)
						.join(
							"; ",
						)}${moving.length > 4 ? `; +${moving.length - 4} more` : ""}`
			: `token --app-speed is ${readToken("--app-speed") || "0.28s"}`,
		shared: true,
	});

	/*
	 * An inline transition outranks every author rule, including the reset, so
	 * it is only a defect when the visitor asked for less motion. Under
	 * `no-preference` it is simply how Mantine does things, and flagging it
	 * would train people to ignore this panel.
	 */
	const inline = Array.from(document.querySelectorAll<HTMLElement>("*")).filter(
		(element) => (element.getAttribute("style") ?? "").includes("transition"),
	);
	findings.push({
		id: "motion:inline",
		group: "motion",
		level: reduced && inline.length > 0 ? "fail" : "pass",
		subject: "No inline transitions",
		detail:
			reduced && inline.length > 0
				? `${inline.length} element${
						inline.length === 1 ? "" : "s"
					} declare an inline transition, which outranks the global reduced-motion reset`
				: inline.length > 0
					? `${inline.length} inline transitions present, all from Mantine's JS-driven components; \`respectReducedMotion: true\` shortens them under reduce`
					: "every transition is declared in a stylesheet, so a media query can reach it",
		shared: false,
	});

	return findings;
};

/* ── The run ─────────────────────────────────────────────────────────── */

export const runAudit = (scheme: "light" | "dark"): Finding[] => [
	...auditTokens(),
	...auditContrast(),
	...auditButtonInk(),
	...probeFocusRing(scheme),
	...auditMotion(),
	...sweepDocument(CANVAS[scheme]),
];

export const GROUP_LABEL: Record<AuditGroup, string> = {
	tokens: "Token resolution",
	contrast: "Declared contrast pairs",
	focus: "Focus ring",
	motion: "Reduced motion",
	document: "Rendered text sweep",
};

export const GROUP_ORDER: readonly AuditGroup[] = [
	"tokens",
	"contrast",
	"focus",
	"motion",
	"document",
];
