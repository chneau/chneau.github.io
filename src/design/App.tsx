import {
	ActionIcon,
	Badge,
	Button,
	Card,
	Code,
	Divider,
	Group,
	Loader,
	type MantineColorsTuple,
	MantineProvider,
	SimpleGrid,
	Stack,
	Text,
	Title,
	UnstyledButton,
} from "@mantine/core";
import {
	AlertTriangle,
	Check,
	Keyboard,
	Layers,
	Moon,
	Palette,
	RotateCcw,
	Ruler,
	Search,
	ShieldCheck,
	Sparkles,
	SquareStack,
	Sun,
	Type,
	Waves,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	APP_SWITCH_SHORTCUTS,
	APPS,
	AppCard,
	AppNav,
	Brand,
	type Command,
	CommandPalette,
	CommandPaletteButton,
	createAppTheme,
	EmptyState,
	Footer,
	Grain,
	HeaderAction,
	prefersReducedMotion,
	SchemeToggle,
	Section,
	ShortcutsHelpButton,
	Skeleton,
	SkipLink,
	Stat,
	StatusDot,
	useCommandPalette,
	useShortcutsHelp,
	useThemeMode,
} from "../shared";
import {
	TOKEN_DEFS,
	type TokenDef,
	type TokenLayers,
	useTokenSnapshot,
} from "./tokens";

/* ══════════════════════════════════════════════════════════════════════
   Theme
   ══════════════════════════════════════════════════════════════════════ */

const brand: MantineColorsTuple = [
	"#eef2ff",
	"#e0e7ff",
	"#c7d2fe",
	"#a5b4fc",
	"#818cf8",
	"#6366f1",
	"#4f46e5",
	"#4338ca",
	"#3730a3",
	"#312e81",
];

/**
 * The gallery runs on the shared indigo ramp, at a shade chosen per scheme so
 * the *composed* system holds up rather than the ramp in isolation.
 *
 * `--app-accent` is `var(--mantine-primary-color-filled)`, so one value is
 * simultaneously the `:focus-visible` ring, `StatusDot --on`, the app-card icon
 * and arrow, and the 11.5px `.app-card__visited--new` label. Each shade has to
 * clear 3:1 against `--app-bg` and `--app-surface` (WCAG 1.4.11, non-text).
 *
 * Light takes shade 6 (`#4f46e5`): 5.7:1 on the background, 6.3:1 under the
 * white ink Mantine paints.
 *
 * Dark takes shade 5 (`#6366f1`) for the same reason. Shade 3 or 4 would give a
 * far better *ring* (9.4:1 / 6.3:1 on a card), but Mantine resolves a filled
 * button's ink in JavaScript from the **light** primary shade — see the
 * `auditButtonInk` note — so it paints white regardless. A lighter dark shade
 * therefore trades a passing ring for an unreadable button label. Shade 5 is
 * the point in this ramp where nothing is badly broken: 4.2:1 ring on a card,
 * and a white label that lands at 4.47:1.
 *
 * The remaining 0.03:1 shortfall on the filled button is a Mantine defect, not
 * a token choice, and the audit panel reports it as such rather than hiding it
 * behind a shade that would fail something worse.
 */
const appTheme = createAppTheme({
	accent: brand,
	accentName: "brand",
	primaryShade: { light: 6, dark: 5 },
	overrides: {
		/*
		 * Mantine writes `transition` *inline* for anything animated in JS
		 * (`Collapse`, which every `Section` uses, among others). An inline
		 * declaration outranks every author rule — including the global
		 * `prefers-reduced-motion` reset in `base.css` — so this flag is the
		 * only thing that can honour the preference for those components. It
		 * defaults to `false`, and the shared theme does not set it, so the
		 * gallery opts in here and the audit proves it worked.
		 */
		respectReducedMotion: true,
	},
});

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

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

/** Root background used to terminate a compositing walk on an opaque layer. */
const CANVAS: Record<"light" | "dark", Rgba> = {
	light: [255, 255, 255, 1],
	dark: [9, 9, 11, 1],
};

/** Parse the colour syntaxes this system actually emits. */
const parseColor = (input: string): Rgba | undefined => {
	const value = input.trim().toLowerCase();
	if (value === "" || value === "transparent") return [0, 0, 0, 0];
	if (value === "currentcolor" || value === "none") return undefined;

	const hex = /^#([0-9a-f]{3,8})$/.exec(value);
	if (hex) {
		const digits = hex[1] ?? "";
		const pair = (index: number) =>
			parseInt(
				digits.length <= 4
					? (digits[index] ?? "0").repeat(2)
					: digits.slice(index * 2, index * 2 + 2),
				16,
			);
		if (digits.length === 3 || digits.length === 4) {
			return [
				pair(0),
				pair(1),
				pair(2),
				digits.length === 4 ? pair(3) / 255 : 1,
			];
		}
		if (digits.length === 6 || digits.length === 8) {
			return [
				pair(0),
				pair(1),
				pair(2),
				digits.length === 8 ? pair(3) / 255 : 1,
			];
		}
		return undefined;
	}

	const fn = /^(rgba?|color)\(([^)]*)\)$/.exec(value);
	if (!fn) return undefined;
	const parts = (fn[2] ?? "")
		.split(/[,/\s]+/)
		.map((part) => part.trim())
		.filter(Boolean);

	// `color(srgb 0 1 0.5 / 50%)` — channels are 0–1, not 0–255.
	const scale = fn[1] === "color" ? 255 : 1;
	const channel = (raw: string | undefined) => {
		if (raw === undefined) return 0;
		return raw.endsWith("%")
			? (Number.parseFloat(raw) / 100) * 255
			: Number.parseFloat(raw) * scale;
	};
	const alpha = (raw: string | undefined) => {
		if (raw === undefined) return 1;
		return raw.endsWith("%")
			? Number.parseFloat(raw) / 100
			: Number.parseFloat(raw);
	};

	if (fn[1] === "color") {
		return [
			channel(parts[0]),
			channel(parts[1]),
			channel(parts[2]),
			alpha(parts[3]),
		];
	}
	return [
		channel(parts[0]),
		channel(parts[1]),
		channel(parts[2]),
		alpha(parts[3]),
	];
};

/** Source-over composite of a translucent layer onto an opaque backdrop. */
const composite = (top: Rgba, bottom: Rgba): Rgba => {
	const alpha = top[3] + bottom[3] * (1 - top[3]);
	if (alpha === 0) return [0, 0, 0, 0];
	return [
		(top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / alpha,
		(top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / alpha,
		(top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / alpha,
		alpha,
	];
};

/** WCAG 2.x relative luminance. */
const luminance = (colour: Rgb): number => {
	const [r, g, b] = colour.map((channel) => {
		const c = channel / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a: Rgba, b: Rgba): number => {
	const l1 = luminance([a[0], a[1], a[2]]);
	const l2 = luminance([b[0], b[1], b[2]]);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

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

type Finding = {
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
const SITE_ACCENT: readonly { name: string; required: boolean }[] = [
	{ name: "--app-accent", required: true },
	{ name: "--app-accent-hover", required: false },
	{ name: "--app-accent-ink", required: false },
	{ name: "--app-accent-line", required: false },
	{ name: "--app-accent-soft", required: false },
];

/** Mantine variables the shared layer reads with an app fallback. */
const MANTINE_ACCENT: readonly string[] = [
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
const AUDIT_SETTLE_MS = 600;

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
	 *     transition-duration: .001ms; … } }
	 *
	 * and that reset is inert. A `*` selector has specificity (0,0,0) and a
	 * media query adds none, so every class rule that declares its own
	 * `transition` — `.app-header-action`, `.app-card`, `.app-statusdot` — wins
	 * outright, and the reset never applies to any of them. Only elements that
	 * happen to have no class-based duration are covered.
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

const runAudit = (scheme: "light" | "dark"): Finding[] => [
	...auditTokens(),
	...auditContrast(),
	...auditButtonInk(),
	...probeFocusRing(scheme),
	...auditMotion(),
	...sweepDocument(CANVAS[scheme]),
];

const GROUP_LABEL: Record<AuditGroup, string> = {
	tokens: "Token resolution",
	contrast: "Declared contrast pairs",
	focus: "Focus ring",
	motion: "Reduced motion",
	document: "Rendered text sweep",
};

const GROUP_ORDER: readonly AuditGroup[] = [
	"tokens",
	"contrast",
	"focus",
	"motion",
	"document",
];

/* ══════════════════════════════════════════════════════════════════════
   Presentation
   ══════════════════════════════════════════════════════════════════════ */

const byCategory = (category: TokenDef["category"]) =>
	TOKEN_DEFS.filter((token) => token.category === category);

const CopyableCode = ({ value, label }: { value: string; label: string }) => {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timeout = window.setTimeout(() => setCopied(false), 1400);
		return () => window.clearTimeout(timeout);
	}, [copied]);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
		} catch {
			// Clipboard access can be denied; leave the label unchanged.
		}
	};

	return (
		<Group gap={6} wrap="nowrap" align="center">
			<UnstyledButton
				onClick={copy}
				title={`Copy ${value}`}
				aria-label={`Copy ${label} token`}
			>
				<Code>{value}</Code>
			</UnstyledButton>
			<Text span size="xs" fw={600} c="brand" aria-live="polite">
				{copied ? "Copied" : ""}
			</Text>
		</Group>
	);
};

/** Visually hidden heading so each card still contributes to the outline. */
const SectionHeading = ({ children }: { children: string }) => (
	<Title order={2} className="sr-only">
		{children}
	</Title>
);

/**
 * Token sync state, drawn with the shared tokens rather than a Mantine `Badge`.
 *
 * `variant="light"` paints its label in the colour's `-light-color` step on a
 * 10%-tinted background, which lands around 3.8:1 at badge size — under the
 * 4.5:1 that small text needs. A dot plus body-text colour says the same thing
 * and passes, which is the point of a gallery.
 */
const DriftBadge = ({
	declared,
	live,
}: {
	declared: string | undefined;
	live: string | undefined;
}) => {
	if (!declared || !live) {
		return (
			<Text size="xs" c="var(--app-text-muted)">
				—
			</Text>
		);
	}
	const drift = declared !== live;
	return (
		<span className="design-audit__kind design-audit__kind--pass">
			<span
				aria-hidden="true"
				style={{
					display: "inline-block",
					width: 6,
					height: 6,
					borderRadius: "var(--app-radius-pill)",
					background: drift ? "var(--app-danger)" : "var(--app-accent)",
				}}
			/>
			{drift ? " drift" : " in sync"}
		</span>
	);
};

const TokenValue = ({ children }: { children: string | undefined }) => (
	<Text
		size="xs"
		c="var(--app-text-muted)"
		className="app-num"
		style={{ wordBreak: "break-word" }}
	>
		{children ?? "—"}
	</Text>
);

const ColourCard = ({
	token,
	layers,
	live,
	scheme,
}: {
	token: TokenDef;
	layers: TokenLayers;
	live: Record<string, string>;
	scheme: "light" | "dark";
}) => {
	const light = layers.light[token.name];
	const dark = layers.dark[token.name];
	const current = scheme === "dark" ? dark : light;

	return (
		<Card withBorder padding="xs" radius="md">
			<div className="design-swatch-pair">
				<div
					className="design-swatch"
					title={`${token.label} — light`}
					style={{ background: light ?? `var(${token.name})` }}
				/>
				<div
					className="design-swatch"
					title={`${token.label} — dark`}
					style={{ background: dark ?? `var(${token.name})` }}
				/>
			</div>
			<Group justify="space-between" gap={6} wrap="nowrap" mt={6}>
				<Text size="xs" fw={600} truncate>
					{token.label}
				</Text>
				<DriftBadge declared={current} live={live[token.name]} />
			</Group>
			<CopyableCode value={`var(${token.name})`} label={token.label} />
			<TokenValue>{`${light ?? "—"} · ${dark ?? "—"}`}</TokenValue>
		</Card>
	);
};

const AccentCard = ({
	name,
	label,
	live,
	required,
}: {
	name: string;
	label: string;
	live: Record<string, string>;
	required: boolean;
}) => (
	<Card withBorder padding="xs" radius="md">
		<div
			className="design-swatch--accent"
			style={{ background: `var(${name})` }}
		/>
		<Group justify="space-between" gap={6} wrap="nowrap" mt={6}>
			<Text size="xs" fw={600} truncate>
				{label}
			</Text>
			{required ? (
				<Badge size="xs" variant="outline" color="brand">
					required
				</Badge>
			) : null}
		</Group>
		<CopyableCode value={`var(${name})`} label={label} />
		<TokenValue>
			{live[name] === undefined || live[name] === ""
				? "not defined — falls through to --mantine-primary-color-*"
				: live[name]}
		</TokenValue>
	</Card>
);

const RadiusCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => (
	<Card withBorder padding="xs" radius="md">
		<div
			className="design-swatch--radius"
			style={{ borderRadius: `var(${token.name})` }}
		/>
		<Text size="xs" fw={600} mt={6}>
			{token.label}
		</Text>
		<CopyableCode value={`var(${token.name})`} label={token.label} />
		<TokenValue>{live[token.name]}</TokenValue>
	</Card>
);

const ShadowCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => (
	<Card withBorder padding="xs" radius="md">
		<div
			className="design-swatch--shadow"
			style={{ boxShadow: `var(${token.name})` }}
		/>
		<Text size="xs" fw={600} mt={6}>
			{token.label}
		</Text>
		<CopyableCode value={`var(${token.name})`} label={token.label} />
		<TokenValue>{live[token.name]}</TokenValue>
	</Card>
);

const FontCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => {
	const mono = token.name.includes("mono");
	return (
		<Card withBorder padding="sm" radius="md">
			<Text
				style={{
					fontFamily: `var(${token.name})`,
					fontSize: mono ? 14 : 18,
				}}
			>
				{mono ? "00:00 · £12.50 · 1,234" : "Grumpy wizards make toxic brew"}
			</Text>
			<Group justify="space-between" mt={6} gap={6} wrap="nowrap">
				<Text size="xs" fw={600}>
					{token.label}
				</Text>
				<CopyableCode value={`var(${token.name})`} label={token.label} />
			</Group>
			<TokenValue>{live[token.name]}</TokenValue>
		</Card>
	);
};

const AuditPanel = ({
	findings,
	pending,
	schemeWord,
}: {
	findings: readonly Finding[];
	pending: boolean;
	schemeWord: "light" | "dark";
}) => {
	const failures = findings.filter((finding) => finding.level === "fail");
	const [open, setOpen] = useState(false);

	return (
		<div className="design-audit" data-design-audit="">
			<Group gap="sm" align="center" wrap="wrap">
				{pending ? (
					<Badge variant="light" color="gray" leftSection={<Ruler size={12} />}>
						measuring the {schemeWord} scheme
					</Badge>
				) : failures.length === 0 ? (
					<Badge
						variant="light"
						color="brand"
						leftSection={<ShieldCheck size={12} />}
					>
						all {findings.length} checks pass
					</Badge>
				) : (
					<Badge
						variant="light"
						color="red"
						leftSection={<AlertTriangle size={12} />}
					>
						{failures.length} of {findings.length} checks fail
					</Badge>
				)}
				<Button
					size="compact-sm"
					variant="default"
					disabled={pending}
					onClick={() => setOpen((value) => !value)}
					aria-expanded={open}
				>
					{open ? "Hide" : "Show"} report
				</Button>
			</Group>

			{open && !pending ? (
				<Stack gap="xs">
					{GROUP_ORDER.map((group) => {
						const rows = findings.filter((finding) => finding.group === group);
						if (rows.length === 0) return null;
						const groupFailures = rows.filter(
							(finding) => finding.level === "fail",
						).length;
						return (
							<details
								key={group}
								className="design-audit__group"
								open={groupFailures > 0}
							>
								<summary>
									{GROUP_LABEL[group]}
									<Badge
										size="xs"
										variant="outline"
										color={groupFailures > 0 ? "red" : "brand"}
									>
										{groupFailures > 0
											? `${groupFailures} failing`
											: `${rows.length} passing`}
									</Badge>
								</summary>
								<div className="design-audit__rows">
									{rows.map((finding) => (
										<div key={finding.id} className="design-audit__row">
											<span
												className={`design-audit__kind design-audit__kind--${finding.level}`}
											>
												{finding.level}
											</span>
											<span className="design-audit__subject">
												{finding.subject}
												{finding.level === "fail" && finding.shared ? (
													<Badge size="xs" variant="outline" color="red" ml={6}>
														shared layer
													</Badge>
												) : null}
											</span>
											<span className="design-audit__detail">
												{finding.detail}
											</span>
										</div>
									))}
								</div>
							</details>
						);
					})}
				</Stack>
			) : null}
		</div>
	);
};

/* ══════════════════════════════════════════════════════════════════════
   App
   ══════════════════════════════════════════════════════════════════════ */

export const App = () => {
	// The one shared theme store: persists the choice, follows the OS until the
	// visitor picks a scheme for themselves, and mirrors it onto <html> so the
	// drift check below reads the live tokens. `scheme` is always concrete,
	// never `auto`.
	const theme = useThemeMode();
	const dark = theme.dark;
	const scheme = theme.resolved;
	const [stops, setStops] = useState(24);
	const [pinned, setPinned] = useState<string[]>([]);
	const [moved, setMoved] = useState(false);
	const [findings, setFindings] = useState<readonly Finding[]>([]);
	// Findings belong to the scheme they were measured in. Clearing them up
	// front means the panel never shows light-scheme numbers labelled "dark".
	const [audited, setAudited] = useState<"light" | "dark">("light");
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();

	const { layers, live } = useTokenSnapshot(scheme);

	/*
	 * The audit runs once per scheme, and only once the document has stopped
	 * moving.
	 *
	 * The settle is load-bearing rather than cosmetic. `.app-card` transitions
	 * `background-color` over 0.3s, so reading one animation frame after the
	 * toggle catches a *mid-interpolation* backdrop — `rgb(118, 118, 120)`
	 * instead of `rgb(18, 18, 21)` — and the sweep then confidently reports
	 * near-white cards holding near-white text. Listening for the first
	 * `transitionend` is not enough either: any short transition in the page
	 * (a 150ms chevron) fires first and the sweep runs mid-fade again.
	 *
	 * `getAnimations()` is the precise instrument — it lists exactly the
	 * running transitions, so awaiting all of them means the measurement
	 * happens when the document is genuinely at rest. Infinite animations
	 * (`app-breathe`, `app-shimmer`) never finish, so they are excluded and the
	 * timer is only a backstop.
	 */
	const scheduleAudit = useCallback((next: "light" | "dark") => {
		let cancelled = false;
		let timer = 0;

		setFindings([]);
		setAudited(next);

		const finish = () => {
			if (cancelled) return;
			window.requestAnimationFrame(() => {
				if (!cancelled) setFindings(runAudit(next));
			});
		};

		// `getAnimations` is the right instrument but is not universally
		// available (happy-dom has no Web Animations model), so the settle
		// degrades to the timer rather than throwing.
		const running =
			typeof document.getAnimations === "function"
				? document
						.getAnimations()
						.filter(
							(animation): animation is CSSTransition =>
								typeof CSSTransition !== "undefined" &&
								animation instanceof CSSTransition &&
								animation.playState === "running",
						)
				: [];

		if (running.length > 0) {
			void Promise.allSettled(running.map((a) => a.finished)).then(finish);
		} else {
			window.requestAnimationFrame(finish);
		}
		timer = window.setTimeout(finish, AUDIT_SETTLE_MS);

		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, []);

	useEffect(() => scheduleAudit(scheme), [scheme, scheduleAudit]);

	// Mirror the hub's shortcuts so the hint below is honest: 1–6 switch app, T themes.
	const themeRef = useRef(theme);
	themeRef.current = theme;
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement
			) {
				return;
			}
			const target = APPS.find((app) => app.hotkey === event.key);
			if (target) {
				window.location.href = target.href;
			} else if (event.key.toLowerCase() === "t") {
				themeRef.current.toggle();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const togglePin = (href: string) =>
		setPinned((current) =>
			current.includes(href)
				? current.filter((value) => value !== href)
				: [...current, href],
		);

	const commands: Command[] = [
		{
			id: "toggle-theme",
			label: "Toggle light / dark theme",
			hint: "T",
			keywords: "theme dark light mode appearance",
			icon: dark ? <Sun size={16} /> : <Moon size={16} />,
			run: () => themeRef.current.toggle(),
		},
		{
			id: "keyboard-shortcuts",
			label: "Keyboard shortcuts",
			hint: "?",
			keywords: "shortcuts keyboard keys help",
			icon: <Keyboard size={16} />,
			run: () => shortcuts.open(),
		},
		{
			id: "reset-demo-controls",
			label: "Reset demo controls",
			keywords: "reset demo controls default stops theme pins",
			icon: <RotateCcw size={16} />,
			run: () => {
				setStops(24);
				setPinned([]);
				// Hand the choice back to the operating system, instead of
				// freezing the current scheme the way the old local store did.
				themeRef.current.reset();
			},
		},
	];

	const failureCount = findings.filter(
		(finding) => finding.level === "fail",
	).length;
	// True while the sweep is pending or when these numbers belong to the other
	// scheme, so the panel can say "running" instead of showing stale rows.
	const auditPending = findings.length === 0 || audited !== scheme;

	return (
		<MantineProvider
			theme={appTheme}
			forceColorScheme={dark ? "dark" : "light"}
		>
			<SkipLink />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					minHeight: "100dvh",
					background: "var(--app-bg)",
				}}
			>
				<AppNav
					// This app binds the command palette, so the shared help dialog
					// may advertise it.
					hasCommandPalette
					icon={<Layers size={18} />}
					title="Design System"
					subtitle="Shared foundation"
					actions={<CommandPaletteButton onClick={palette.open} />}
					shortcuts={[]}
					globalShortcuts={APP_SWITCH_SHORTCUTS}
					theme={{ dark, onToggle: theme.toggle }}
				/>

				<main id="main" className="design-main">
					<Stack gap="lg">
						<div className="design-hero">
							<Title order={1}>Design System</Title>
							<Text c="var(--app-text-muted)">
								The living style guide: every value below is read back from{" "}
								<Code>tokens.css</Code> at runtime, so the gallery never drifts
								from the system it documents. Toggle the scheme to see the light
								and dark layers swap.
							</Text>
							<div className="design-kbd-row">
								<Text size="xs" c="var(--app-text-muted)">
									Switch app
								</Text>
								<kbd className="app-kbd">1</kbd>
								<Text size="xs" c="var(--app-text-muted)">
									–
								</Text>
								<kbd className="app-kbd">6</kbd>
								<Text size="xs" c="var(--app-text-muted)">
									·
								</Text>
								<Text size="xs" c="var(--app-text-muted)">
									theme
								</Text>
								<kbd className="app-kbd">T</kbd>
							</div>
						</div>

						<Section
							title="Accessibility audit"
							badge={<ShieldCheck size={14} />}
							actions={
								<Text size="xs" c="var(--app-text-muted)" aria-live="polite">
									{auditPending
										? "measuring…"
										: failureCount === 0
											? `${findings.length} checks, all passing`
											: `${failureCount} of ${findings.length} failing`}
								</Text>
							}
						>
							<SectionHeading>Accessibility audit</SectionHeading>
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
								This page checks itself. Every row below is measured from the
								live document — resolved custom properties, the outline the
								browser actually paints, and the composited backdrop behind
								every rendered string — so the panel fails on the same things a
								visitor would fail on. It re-runs when you change scheme and
								never during a render.
							</Text>
							<AuditPanel
								findings={findings}
								pending={auditPending}
								schemeWord={scheme}
							/>
						</Section>

						<Section title="Colour tokens" badge={<Palette size={14} />}>
							<SectionHeading>Colour tokens</SectionHeading>
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
								Each card shows the declared light and dark values side by side.
								The badge compares the active scheme's declaration with the live
								computed value.
							</Text>
							<SimpleGrid
								cols={{ base: 2, sm: 3, md: 4 }}
								spacing="sm"
								role="group"
								aria-label="Colour token swatches"
							>
								{byCategory("colour").map((token) => (
									<ColourCard
										key={token.name}
										token={token}
										layers={layers}
										live={live}
										scheme={scheme}
									/>
								))}
							</SimpleGrid>
							<Text
								size="xs"
								fw={700}
								tt="uppercase"
								c="var(--app-text-muted)"
								mt="md"
								className="design-subhead"
							>
								Accent family
							</Text>
							<Text size="xs" c="var(--app-text-muted)" mt={4} mb="xs">
								<code>--app-accent</code> is site-provided: the shared layer
								reads it with a body-text fallback in the{" "}
								<code>:focus-visible</code> ring and in{" "}
								<code>StatusDot --on</code>, so an app that forgets it loses its
								accent without a single warning. The other four are only ever
								read behind a <code>--mantine-primary-color-*</code> value, so
								they are optional.
							</Text>
							<SimpleGrid
								cols={{ base: 2, sm: 3, md: 5 }}
								spacing="sm"
								role="group"
								aria-label="Accent token swatches"
							>
								{[
									...SITE_ACCENT.map((entry) => ({
										...entry,
										label:
											entry.name === "--app-accent"
												? "Accent"
												: entry.name.replace("--app-accent-", "Accent "),
									})),
									...MANTINE_ACCENT.map((name) => ({
										name,
										required: false,
										label: name.replace("--mantine-primary-color-", "Mantine "),
									})),
								].map((entry) => (
									<AccentCard
										key={entry.name}
										name={entry.name}
										label={entry.label}
										live={live}
										required={entry.required}
									/>
								))}
							</SimpleGrid>
						</Section>

						<Section title="Radii" badge={<SquareStack size={14} />}>
							<SectionHeading>Radii</SectionHeading>
							<SimpleGrid
								cols={{ base: 2, sm: 3, md: 5 }}
								spacing="sm"
								role="group"
								aria-label="Radius tokens"
							>
								{byCategory("radius").map((token) => (
									<RadiusCard key={token.name} token={token} live={live} />
								))}
							</SimpleGrid>
						</Section>

						<Section title="Shadows" badge={<Sparkles size={14} />}>
							<SectionHeading>Shadows</SectionHeading>
							<SimpleGrid
								cols={{ base: 1, sm: 3 }}
								spacing="md"
								role="group"
								aria-label="Shadow tokens"
							>
								{byCategory("shadow").map((token) => (
									<ShadowCard key={token.name} token={token} live={live} />
								))}
							</SimpleGrid>
						</Section>

						<Section
							title="Glass & border-strong"
							badge={<Palette size={14} />}
						>
							<SectionHeading>Glass and border-strong</SectionHeading>
							<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
								<Card withBorder padding="md" radius="md">
									<div className="app-glass design-swatch--lg">
										<Text size="sm">.app-glass</Text>
									</div>
									<Group justify="space-between" mt="xs" gap="xs">
										<Text size="xs" fw={600}>
											Glass panel
										</Text>
										<CopyableCode value="var(--app-glass)" label="Glass" />
									</Group>
									<TokenValue>{live["--app-glass"]}</TokenValue>
								</Card>
								<Card withBorder padding="md" radius="md">
									<div
										className="design-swatch--lg"
										style={{
											border: "1px solid var(--app-border-strong)",
											background: "var(--app-surface)",
										}}
									>
										<Text size="sm">1px border-strong</Text>
									</div>
									<Group justify="space-between" mt="xs" gap="xs">
										<Text size="xs" fw={600}>
											Border strong
										</Text>
										<CopyableCode
											value="var(--app-border-strong)"
											label="Border strong"
										/>
									</Group>
									<TokenValue>{live["--app-border-strong"]}</TokenValue>
								</Card>
							</SimpleGrid>
						</Section>

						<Section title="Typography" badge={<Type size={14} />}>
							<SectionHeading>Typography</SectionHeading>
							<Stack gap="xs" mb="md">
								<Title order={1} component="div">
									Heading one
								</Title>
								<Title order={2} component="div">
									Heading two
								</Title>
								<Title order={3} component="div">
									Heading three
								</Title>
								<Text>Body text, the default reading size.</Text>
								<Text c="var(--app-text-muted)">
									Muted text for secondary detail, drawn from{" "}
									<code>--app-text-muted</code> rather than Mantine's{" "}
									<code>dimmed</code>, which lands near 3:1 on the app
									background in light.
								</Text>
								<Text c="var(--app-text-faint)">
									Faint text for tertiary detail, drawn from{" "}
									<code>--app-text-faint</code>.
								</Text>
								<Text className="app-num">00:00 · 1,234 · £12.50</Text>
							</Stack>
							<SimpleGrid
								cols={{ base: 1, sm: 3 }}
								spacing="sm"
								role="group"
								aria-label="Font stacks"
							>
								{byCategory("typography").map((token) => (
									<FontCard key={token.name} token={token} live={live} />
								))}
							</SimpleGrid>
						</Section>

						<Section title="Motion" badge={<Waves size={14} />}>
							<SectionHeading>Motion</SectionHeading>
							<Stack gap="sm">
								<Group gap="lg" align="center" wrap="wrap">
									<div className="design-track">
										<span
											aria-hidden="true"
											className={`design-thumb${
												moved ? " design-thumb--end" : ""
											}`}
										/>
									</div>
									<Button
										variant="default"
										size="sm"
										leftSection={<Zap size={14} />}
										onClick={() => setMoved((value) => !value)}
									>
										Animate
									</Button>
									<Text size="xs" c="var(--app-text-muted)">
										Driven by a class, not an inline style:{" "}
										<code>shared/motion.ts</code> is explicit that an inline{" "}
										<code>transition</code> outranks the global{" "}
										<code>prefers-reduced-motion</code> reset, so a
										stylesheet-driven demo is the only honest one.
									</Text>
								</Group>
								<Stack gap={6}>
									{byCategory("motion").map((token) => (
										<Group
											key={token.name}
											justify="space-between"
											gap="md"
											wrap="wrap"
										>
											<Text size="sm" fw={600}>
												{token.label}
											</Text>
											<Group gap="sm" wrap="nowrap">
												<CopyableCode
													value={`var(${token.name})`}
													label={token.label}
												/>
												<TokenValue>{live[token.name]}</TokenValue>
											</Group>
										</Group>
									))}
								</Stack>
								<Divider />
								<Stack gap={6}>
									<Group justify="space-between" gap="md" wrap="wrap">
										<Text size="sm" fw={600}>
											Keyframes in the shared layer
										</Text>
										<Text size="xs" c="var(--app-text-muted)">
											{prefersReducedMotion() ? "reduced" : "full"}
										</Text>
									</Group>
									<Group gap="sm" wrap="wrap">
										<Badge variant="outline" color="brand">
											app-breathe
										</Badge>
										<Badge variant="outline" color="brand">
											app-shimmer
										</Badge>
										<Badge variant="outline" color="brand">
											app-rise
										</Badge>
									</Group>
									<div className="app-rise design-rise-demo">
										<Group gap="sm" align="center">
											<StatusDot label="Breathing" />
											<Text size="sm">
												<code>app-rise</code> on entry, <code>app-breathe</code>{" "}
												on the dot, <code>app-shimmer</code> on the skeletons
												below.
											</Text>
										</Group>
									</div>
								</Stack>
							</Stack>
						</Section>

						<Section title="Controls" badge={<SquareStack size={14} />}>
							<SectionHeading>Controls</SectionHeading>
							<Stack gap="md">
								<Group
									gap="sm"
									wrap="wrap"
									role="group"
									aria-label="Header actions"
								>
									<CommandPaletteButton onClick={palette.open} />
									<ShortcutsHelpButton onClick={shortcuts.open} />
									<SchemeToggle dark={dark} onToggle={theme.toggle} />
									<HeaderAction
										iconOnly
										label="Icon only"
										icon={<Zap size={16} />}
									/>
									<HeaderAction label="With label" icon={<Zap size={16} />}>
										Action
									</HeaderAction>
									<HeaderAction
										accent
										label="Accent action"
										icon={<Zap size={16} />}
									>
										Primary
									</HeaderAction>
									<HeaderAction
										active
										label="Active action"
										icon={<Zap size={16} />}
									>
										Active
									</HeaderAction>
									<HeaderAction
										disabled
										label="Disabled action"
										icon={<Zap size={16} />}
									>
										Disabled
									</HeaderAction>
									<HeaderAction
										loading
										label="Loading action"
										icon={<Loader size={16} />}
									>
										Loading
									</HeaderAction>
								</Group>
								<Divider />
								<Group
									gap="sm"
									wrap="wrap"
									role="group"
									aria-label="Mantine controls"
								>
									<Button>Filled</Button>
									<Button variant="light">Light</Button>
									<Button variant="default">Default</Button>
									<Button variant="subtle">Subtle</Button>
									<Button variant="outline">Outline</Button>
									<ActionIcon
										variant="default"
										size={36}
										aria-label="Demo icon action"
									>
										<Zap size={16} />
									</ActionIcon>
									<Badge variant="light">Badge</Badge>
									<Badge variant="outline" color="brand">
										Brand
									</Badge>
								</Group>
								<Text size="xs" c="var(--app-text-muted)">
									Mantine's own <code>dimmed</code> colour is not used for body
									copy here: it is <code>#868e96</code> in light, which is 3.0:1
									on the app background. Everything secondary on this page reads
									a <code>--app-text-*</code> token instead. The audit panel
									below the header is what keeps that honest.
								</Text>
							</Stack>
						</Section>

						<Section
							title="Indicators"
							badge={<Sparkles size={14} />}
							actions={
								<Text size="xs" c="var(--app-text-muted)">
									status · skeleton · empty
								</Text>
							}
						>
							<SectionHeading>Indicators</SectionHeading>
							<Stack gap="md">
								<Group gap="lg">
									<Group gap="xs">
										<StatusDot />
										<Text size="sm">Online</Text>
									</Group>
									<Group gap="xs">
										<StatusDot on={false} />
										<Text size="sm">Offline</Text>
									</Group>
									<Group gap="xs">
										<StatusDot label="Live data feed" />
										<Text size="sm">Labelled status</Text>
									</Group>
								</Group>
								<Text size="xs" c="var(--app-text-muted)">
									<code>StatusDot --on</code> is{" "}
									<code>var(--app-accent, var(--app-text))</code>. With the
									token defined above it is the accent; without it it silently
									becomes the body text colour and the "online" light looks like
									ordinary text. The audit panel checks for exactly that
									collapse.
								</Text>
								<Stack gap={6}>
									<Skeleton width="60%" />
									<Skeleton width="40%" />
									<Skeleton width="80%" height={10} />
								</Stack>
								<EmptyState
									icon={<Search size={20} />}
									title="Nothing here yet"
									body="Empty states share the same mark, title, body and action. This action hands the colour scheme back to your operating system."
									action={
										<Button
											variant="default"
											size="sm"
											leftSection={<RotateCcw size={14} />}
											onClick={theme.reset}
										>
											Reset
										</Button>
									}
								/>
							</Stack>
						</Section>

						<Section title="Utilities" badge={<Ruler size={14} />}>
							<SectionHeading>Utilities</SectionHeading>
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
								The <code>app-*</code> utility classes in <code>base.css</code>{" "}
								are what the components are made of. They are part of the public
								surface, so they are shown rather than assumed.
							</Text>
							<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
								<div className="design-utility">
									<code className="app-num">.app-press</code>
									<Button
										size="compact-sm"
										className="app-press"
										variant="default"
									>
										Press me
									</Button>
								</div>
								<div className="design-utility">
									<code className="app-num">.app-surface</code>
									<div
										className="app-surface"
										style={{ padding: "8px 12px", fontSize: 12 }}
									>
										elevated panel
									</div>
								</div>
								<div className="design-utility">
									<code className="app-num">.app-kbd</code>
									<kbd className="app-kbd">⌘K</kbd>
									<kbd className="app-kbd">?</kbd>
								</div>
								<div className="design-utility">
									<code className="app-num">.app-num</code>
									<Text size="sm" className="app-num">
										1,234.56
									</Text>
								</div>
								<div className="design-utility">
									<code className="app-num">.app-scroll</code>
									<span
										style={{
											fontSize: 12,
											color: "var(--app-text-muted)",
										}}
									>
										thin, themed scrollbar
									</span>
								</div>
								<div className="design-utility app-rise">
									<code className="app-num">.app-rise</code>
									<span
										style={{
											fontSize: 12,
											color: "var(--app-text-muted)",
										}}
									>
										staggered by <code>--app-index</code>
									</span>
								</div>
							</SimpleGrid>
							<div className="design-scroll app-scroll" aria-hidden="true">
								<div className="design-scroll__inner">
									{/*
									 * Eight identical, purely decorative placeholders. The list is a
									 * literal `Array.from({length: 8})` that is never sorted, filtered
									 * or reordered, and the wrapper is aria-hidden, so there is no
									 * state for an index key to mis-associate. It is provably correct
									 * here; a generated id would imply stability it does not need.
									 *
									 * The suppression below has to stay a single line and directly
									 * above the element. Spreading the explanation over several `//`
									 * lines leaves the directive too far away for biome to attach it,
									 * and it then reports the suppression as unused while still
									 * flagging the key - which is a confusing pair of diagnostics for
									 * what is one decision.
									 */}
									{Array.from({ length: 8 }, (_, index) => {
										const width = `${60 + ((index * 7) % 35)}%`;
										return <Skeleton key={index} width={width} />;
									})}
								</div>
							</div>
						</Section>

						<Section title="Data" badge={<SquareStack size={14} />}>
							<SectionHeading>Data</SectionHeading>
							<SimpleGrid
								cols={{ base: 1, sm: 3 }}
								spacing="md"
								role="group"
								aria-label="Stat blocks"
							>
								<Stat
									icon={<Zap size={13} />}
									label="Fastest"
									value="142 km/h"
									hint="average across the run"
								/>
								<Stat label="Longest" value="386 km" hint="end to end" />
								<Stat
									label="Most stops"
									value={stops}
									icon={stops === 31 ? <Check size={13} /> : undefined}
									hint={stops === 24 ? "click to show peak" : "click to reset"}
									onClick={() => setStops((value) => (value === 24 ? 31 : 24))}
								/>
							</SimpleGrid>
						</Section>

						<Section title="App cards" badge={<Layers size={14} />}>
							<SectionHeading>App cards</SectionHeading>
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
								<code>AppCard</code> is the dashboard tile, reused here. Pin a
								card to see the pinned state; the whole surface stays a single
								link. Its tag badges are rendered by the shared component, so
								the audit below is measuring shared code, not this page.
							</Text>
							{/*
							 * A named <section> rather than <div role="group">: the
							 * element is a region with an accessible name, which is
							 * what the ARIA role was standing in for, and it does it
							 * with a real element instead of a role bolted onto a
							 * generic one. `role="group"` is for widget groupings,
							 * not for labelling a region of static content.
							 */}
							<section className="app-grid" aria-label="App card examples">
								{APPS.map((item, index) => (
									<AppCard
										key={item.href}
										item={item}
										index={index}
										pinned={pinned.includes(item.href)}
										lastVisitedAt={
											index === 0 ? Date.now() - 3_600_000 : undefined
										}
										onTogglePin={togglePin}
									/>
								))}
							</section>
						</Section>

						<Section title="Patterns" badge={<Sparkles size={14} />}>
							<SectionHeading>Patterns</SectionHeading>
							<Text size="sm" c="var(--app-text-muted)" mb="sm">
								The shared loading, empty and status states compose without any
								extra styling.
							</Text>
							<Card withBorder padding="md" radius="md">
								<Group justify="space-between" mb="sm">
									<Group gap="xs">
										<StatusDot label="Syncing" />
										<Text size="sm" fw={600}>
											Syncing data
										</Text>
									</Group>
									<Badge variant="light">loading</Badge>
								</Group>
								<Stack gap={6}>
									<Skeleton width="70%" />
									<Skeleton width="90%" />
									<Skeleton width="50%" />
								</Stack>
							</Card>
							<EmptyState
								icon={<Search size={20} />}
								title="No matches"
								body="Empty-state mark, heading, body and action are shared across every app."
							/>
						</Section>

						<Section title="Chrome" badge={<Layers size={14} />}>
							<SectionHeading>Chrome</SectionHeading>
							<Stack gap="md">
								<Text size="sm" c="var(--app-text-muted)">
									<code>Brand</code>, <code>AppSwitcher</code>,{" "}
									<code>SkipLink</code>, <code>Grain</code> and{" "}
									<code>Footer</code> frame every page. The skip link and grain
									are always mounted at the top of this page; press Tab from the
									address bar to reveal the skip link.
								</Text>
								<Group gap="lg" align="center" wrap="wrap">
									<Brand
										href="/"
										icon={<Layers size={18} />}
										title="Brand with icon"
										subtitle="and subtitle"
									/>
									<Brand title="Brand only" />
								</Group>
								<Text size="sm" c="var(--app-text-muted)">
									<code>AppSwitcher</code> is the dropdown in the page header
									(above), so it is demonstrated live rather than duplicated
									here.
								</Text>
								<Divider />
								<Text size="sm" c="var(--app-text-muted)">
									Mantine theme layer: <code>createAppTheme</code> owns the
									neutral ramp, shadow scale, default component props and
									accents. The neutral ramp is intentionally <em>not</em>{" "}
									mirrored by <code>tokens.css</code> — they are separate
									layers, as the shared token test locks in.
								</Text>
							</Stack>
						</Section>
					</Stack>
				</main>

				<Footer
					left="Design System · shared foundation"
					right={
						<Group gap="xs">
							<Badge variant="light" color="brand">
								primitives
							</Badge>
							<Badge variant="light">tokens</Badge>
						</Group>
					}
				/>
			</div>
			<Grain />
			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
