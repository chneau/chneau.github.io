import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import {
	applyColorMode,
	type ColorMode,
	initTheme,
	type ResolvedColorMode,
	ROOT_THEME_KEY,
	resolveColorMode,
} from "../index";

/** The hooks write to `<html>`; reset both datasets and storage between tests. */
const reset = () => {
	delete document.documentElement.dataset.theme;
	delete document.documentElement.dataset.mantineColorScheme;
	localStorage.clear();
};

afterEach(reset);

describe("resolveColorMode", () => {
	test("follows the system only when the choice is auto", () => {
		const cases: Array<[ColorMode, boolean, ResolvedColorMode]> = [
			["auto", true, "dark"],
			["auto", false, "light"],
			["dark", false, "dark"],
			["dark", true, "dark"],
			["light", true, "light"],
			["light", false, "light"],
		];

		for (const [mode, prefersDark, expected] of cases) {
			expect(resolveColorMode(mode, prefersDark)).toBe(expected);
		}
	});
});

describe("applyColorMode", () => {
	test("mirrors the scheme onto both html datasets", () => {
		applyColorMode("dark");
		expect(document.documentElement.dataset.theme).toBe("dark");
		expect(document.documentElement.dataset.mantineColorScheme).toBe("dark");
	});

	test("overwrites a previously applied scheme", () => {
		applyColorMode("dark");
		applyColorMode("light");
		expect(document.documentElement.dataset.theme).toBe("light");
		expect(document.documentElement.dataset.mantineColorScheme).toBe("light");
	});
});

describe("initTheme", () => {
	test("defaults to the OS preference when nothing is stored", () => {
		initTheme();
		// happy-dom's matchMedia reports light by default; either way the result
		// must be a concrete scheme, never `auto`.
		expect(["light", "dark"]).toContain(
			document.documentElement.dataset.theme ?? "",
		);
	});

	test("migrates a legacy stored boolean true to dark", () => {
		localStorage.setItem(ROOT_THEME_KEY, "true");
		initTheme(ROOT_THEME_KEY);
		expect(document.documentElement.dataset.theme).toBe("dark");
		expect(document.documentElement.dataset.mantineColorScheme).toBe("dark");
	});

	test("migrates a legacy stored boolean false to light", () => {
		localStorage.setItem(ROOT_THEME_KEY, "false");
		initTheme(ROOT_THEME_KEY);
		expect(document.documentElement.dataset.theme).toBe("light");
	});

	test("accepts the current JSON-encoded mode strings", () => {
		localStorage.setItem(ROOT_THEME_KEY, JSON.stringify("dark"));
		initTheme(ROOT_THEME_KEY);
		expect(document.documentElement.dataset.theme).toBe("dark");

		localStorage.setItem(ROOT_THEME_KEY, JSON.stringify("light"));
		initTheme(ROOT_THEME_KEY);
		expect(document.documentElement.dataset.theme).toBe("light");
	});

	test("falls back to the system for corrupt or unknown values", () => {
		for (const raw of ["not json", "42", "{}", JSON.stringify("sepia")]) {
			reset();
			localStorage.setItem(ROOT_THEME_KEY, raw);
			initTheme(ROOT_THEME_KEY);
			expect(["light", "dark"]).toContain(
				document.documentElement.dataset.theme ?? "",
			);
		}
	});

	test("only reads the key it is given", () => {
		localStorage.setItem("other_app_dark_mode", "true");
		initTheme(ROOT_THEME_KEY);
		expect(document.documentElement.dataset.theme).not.toBe("dark");
	});
});
