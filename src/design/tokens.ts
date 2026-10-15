import { useEffect, useState } from "react";

export type TokenDef = {
	name: string;
	label: string;
	category: "colour" | "shadow" | "radius" | "typography" | "motion";
	scheme?: boolean;
};
export const TOKEN_DEFS: readonly TokenDef[] = [
	{ name: "--app-bg", label: "Background", category: "colour", scheme: true },
	{
		name: "--app-bg-deep",
		label: "Background deep",
		category: "colour",
		scheme: true,
	},
	{ name: "--app-surface", label: "Surface", category: "colour", scheme: true },
	{
		name: "--app-surface-2",
		label: "Surface raised",
		category: "colour",
		scheme: true,
	},
	{
		name: "--app-surface-3",
		label: "Surface sunken",
		category: "colour",
		scheme: true,
	},
	{ name: "--app-border", label: "Border", category: "colour", scheme: true },
	{
		name: "--app-border-strong",
		label: "Border strong",
		category: "colour",
		scheme: true,
	},
	{ name: "--app-text", label: "Text", category: "colour", scheme: true },
	{
		name: "--app-text-muted",
		label: "Text muted",
		category: "colour",
		scheme: true,
	},
	{
		name: "--app-text-faint",
		label: "Text faint",
		category: "colour",
		scheme: true,
	},
	{ name: "--app-danger", label: "Danger", category: "colour", scheme: true },
	{ name: "--app-warn", label: "Warning", category: "colour", scheme: true },
	{ name: "--app-glass", label: "Glass", category: "colour", scheme: true },

	{
		name: "--app-shadow-sm",
		label: "Shadow sm",
		category: "shadow",
		scheme: true,
	},
	{ name: "--app-shadow", label: "Shadow", category: "shadow", scheme: true },
	{
		name: "--app-shadow-lg",
		label: "Shadow lg",
		category: "shadow",
		scheme: true,
	},

	{ name: "--app-radius-xs", label: "Radius xs", category: "radius" },
	{ name: "--app-radius-sm", label: "Radius sm", category: "radius" },
	{ name: "--app-radius-md", label: "Radius md", category: "radius" },
	{ name: "--app-radius-lg", label: "Radius lg", category: "radius" },
	{ name: "--app-radius-pill", label: "Radius pill", category: "radius" },

	{ name: "--app-font-sans", label: "Font sans", category: "typography" },
	{ name: "--app-font-display", label: "Font display", category: "typography" },
	{ name: "--app-font-mono", label: "Font mono", category: "typography" },

	{ name: "--app-ease", label: "Ease", category: "motion" },
	{ name: "--app-speed", label: "Speed", category: "motion" },
];

export type AccentToken = {
	name: string;
	label: string;
	required: boolean;
	whenUnset: string;
};

export const ACCENT_TOKENS: readonly AccentToken[] = [
	{
		name: "--app-accent",
		label: "Accent",
		required: true,
		whenUnset: "base.css falls back to var(--app-text)",
	},
	{
		name: "--app-accent-hover",
		label: "Accent hover",
		required: false,
		whenUnset: "base.css falls back to var(--app-accent, var(--app-text))",
	},
	{
		name: "--app-accent-ink",
		label: "Accent ink",
		required: false,
		whenUnset: "base.css falls back to var(--app-text)",
	},
	{
		name: "--app-accent-line",
		label: "Accent line",
		required: false,
		whenUnset: "base.css falls back to var(--app-border-strong)",
	},
	{
		name: "--app-accent-soft",
		label: "Accent soft",
		required: false,
		whenUnset: "base.css falls back to var(--app-surface-2)",
	},
	{
		name: "--mantine-primary-color-filled",
		label: "Mantine filled",
		required: false,
		whenUnset: "base.css falls back to var(--app-accent, var(--app-text))",
	},
	{
		name: "--mantine-primary-color-filled-hover",
		label: "Mantine filled hover",
		required: false,
		whenUnset:
			"base.css falls back to var(--app-accent-hover, var(--app-accent, var(--app-text)))",
	},
	{
		name: "--mantine-primary-color-light",
		label: "Mantine light",
		required: false,
		whenUnset:
			"base.css falls back to var(--app-accent-soft, var(--app-surface-2))",
	},
	{
		name: "--mantine-primary-color-light-hover",
		label: "Mantine light hover",
		required: false,
		whenUnset:
			"base.css falls back to var(--app-accent-soft, var(--app-surface-2))",
	},
	{
		name: "--mantine-primary-color-light-color",
		label: "Mantine light ink",
		required: false,
		whenUnset: "base.css falls back to var(--app-accent-ink, var(--app-text))",
	},
	{
		name: "--mantine-primary-color-contrast",
		label: "Mantine contrast",
		required: false,
		whenUnset: "base.css falls back to #ffffff",
	},
];

const TOKEN_NAMES: readonly string[] = [
	...TOKEN_DEFS.map((token) => token.name),
	...ACCENT_TOKENS.map((token) => token.name),
];

const readToken = (name: string): string => {
	if (typeof window === "undefined") return "";
	return window
		.getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
};

export type TokenLayers = {
	light: Record<string, string>;
	dark: Record<string, string>;
};

const readLayersFromStyleSheets = (): TokenLayers => {
	const light: Record<string, string> = {};
	const dark: Record<string, string> = {};

	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue;
		}
		for (const rule of Array.from(rules)) {
			if (!("selectorText" in rule) || !("style" in rule)) continue;
			const styleRule = rule as CSSStyleRule;
			const selector = styleRule.selectorText;
			const isDark = /data-(mantine-color-scheme|theme)=["']?dark/.test(
				selector,
			);
			const target = isDark ? dark : selector.trim() === ":root" ? light : null;
			if (!target) continue;
			for (const property of Array.from(styleRule.style)) {
				if (!property.startsWith("--app-") || target[property]) continue;
				target[property] = styleRule.style
					.getPropertyValue(property)
					.replace(/\s+/g, " ")
					.trim();
			}
		}
	}

	return { light, dark };
};

const readTokenLayers = (): TokenLayers => {
	if (typeof document === "undefined") return { light: {}, dark: {} };
	return readLayersFromStyleSheets();
};

const readLiveTokens = (): Record<string, string> => {
	const live: Record<string, string> = {};
	for (const name of TOKEN_NAMES) live[name] = readToken(name);
	return live;
};

export const useTokenSnapshot = (scheme: "light" | "dark") => {
	const [layers, setLayers] = useState<TokenLayers>({ light: {}, dark: {} });
	const [live, setLive] = useState<Record<string, string>>({});

	useEffect(() => {
		setLayers(readTokenLayers());
		setLive(readLiveTokens());
	}, [scheme]);

	return { layers, live };
};

type SharedStyles = {
	utilities: readonly string[];
	keyframes: readonly string[];
};

const visitRules = (
	rules: CSSRuleList,
	visit: (rule: CSSRule) => void,
): void => {
	for (const rule of Array.from(rules)) {
		visit(rule);
		if ("cssRules" in rule) {
			visitRules((rule as CSSGroupingRule).cssRules, visit);
		}
	}
};

const readSharedStyles = (): SharedStyles => {
	if (typeof document === "undefined") return { utilities: [], keyframes: [] };
	const utilities = new Set<string>();
	const keyframes = new Set<string>();

	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue;
		}
		visitRules(rules, (rule) => {
			if ("selectorText" in rule) {
				const selector = (rule as CSSStyleRule).selectorText;
				for (const match of selector.matchAll(/\.app-[a-zA-Z0-9_-]+/g)) {
					utilities.add(match[0]);
				}
			}
			if ("name" in rule) {
				const name = (rule as CSSKeyframesRule).name;
				if (typeof name === "string" && name.startsWith("app-")) {
					keyframes.add(name);
				}
			}
		});
	}

	return {
		utilities: [...utilities].sort(),
		keyframes: [...keyframes].sort(),
	};
};

export const useSharedStyles = (): SharedStyles => {
	const [styles] = useState(readSharedStyles);
	return styles;
};
