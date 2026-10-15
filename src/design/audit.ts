import { composite, parseColor, type Rgba, ratio } from "../shared/colour";
import { ACCENT_TOKENS, TOKEN_DEFS } from "./tokens";

const CANVAS: Record<"light" | "dark", Rgba> = {
	light: [255, 255, 255, 1],
	dark: [9, 9, 11, 1],
};

const rootStyle = (): CSSStyleDeclaration =>
	getComputedStyle(document.documentElement);

const readToken = (name: string): string =>
	rootStyle().getPropertyValue(name).trim();

const readColourToken = (name: string): Rgba | undefined => {
	const raw = readToken(name);
	return raw === "" ? undefined : parseColor(raw);
};

type Level = "fail" | "pass";
type AuditGroup = "tokens" | "contrast" | "focus" | "motion" | "document";

export type Finding = {
	id: string;
	group: AuditGroup;
	level: Level;
	subject: string;
	detail: string;
	shared: boolean;
};

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

const REQUIRED_TOKENS: readonly string[] = TOKEN_DEFS.map(
	(token) => token.name,
);

const isSharedLayer = (element: Element): boolean => {
	const own = element.getAttribute("class") ?? "";
	if (/(^|\s)app-/.test(own) || /(^|\s)mantine-/.test(own)) return true;
	const parent = element.parentElement;
	return parent ? isSharedLayer(parent) : false;
};

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

const sweepDocument = (canvas: Rgba): Finding[] => {
	const findings: Finding[] = [];
	const seen = new Set<string>();

	for (const element of Array.from(document.body.querySelectorAll("*"))) {
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

const FOCUS_PROBE_CLASS = "design-probe";

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

	for (const token of ACCENT_TOKENS) {
		const value = readToken(token.name);
		findings.push({
			id: `accent:${token.name}`,
			group: "tokens",
			level: value === "" && token.required ? "fail" : "pass",
			subject: token.name,
			detail: value === "" ? `not set — ${token.whenUnset}` : value,
			shared: false,
		});
	}

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

const auditButtonInk = (): Finding[] => {
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

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const AUDIT_SETTLE_MS = 600;

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

	const inline = Array.from(document.querySelectorAll<HTMLElement>("*")).filter(
		(element) =>
			element.style.length > 0 && element.style.cssText.includes("transition"),
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
