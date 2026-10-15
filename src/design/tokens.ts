import { useEffect, useState } from "react";

export type TokenDef = {
	name: string;
	label: string;
	category: "colour" | "shadow" | "radius" | "typography" | "motion" | "accent";
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

	{
		name: "--mantine-primary-color-filled",
		label: "Accent filled",
		category: "accent",
	},
	{
		name: "--mantine-primary-color-light",
		label: "Accent light",
		category: "accent",
	},
	{
		name: "--mantine-primary-color-light-color",
		label: "Accent ink",
		category: "accent",
	},
	{
		name: "--mantine-primary-color-contrast",
		label: "Accent contrast",
		category: "accent",
	},
];

const TOKEN_NAMES: readonly string[] = TOKEN_DEFS.map((token) => token.name);

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
