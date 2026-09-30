import "../../shared/tests/happy-dom";
import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { createElement } from "react";
import type { Birthday } from "../birthdays";
import { birthdays } from "../birthdays";
import {
	SHARE_CARD_HEIGHT,
	SHARE_CARD_WIDTH,
	ShareCard,
	shareCardFileName,
} from "../ShareCard";

// `createElement` rather than JSX: Bun picks its JSX transform from the file
// extension, and every other JSX test in the repo is `.tsx`. This file is `.ts`,
// so the card is built by hand. Nothing else here needs the transform.
const card = (record: Birthday) => createElement(ShareCard, { record });
const cardWithRef = (
	record: Birthday,
	ref: (el: HTMLDivElement | null) => void,
) => createElement(ShareCard, { record, ref });

/** The component source, for assertions React's own parsing would hide. */
const SHARE_CARD_SOURCE = new URL("../ShareCard.tsx", import.meta.url).pathname;

/**
 * Colour syntaxes html2canvas's parser cannot handle. Each one either throws
 * during paint or is silently dropped by React before it reaches the DOM.
 */
const BANNED_COLOUR_FUNCTIONS = [
	"color-mix(",
	"oklch(",
	"oklab(",
	"lab(",
	"lch(",
	"hwb(",
	"color(",
	"light-dark(",
];

/**
 * Two things are guarded here, and neither is observable without them.
 *
 * 1. `shareCardFileName` is the only thing between a display name containing
 *    `/`, `&`, spaces or diacritics and a broken or surprising `download`
 *    attribute.
 *
 * 2. The html2canvas-safety assertions below. Every banned property produces
 *    a *silently blank* export: the download succeeds, the file opens, and it
 *    is empty or unpainted. Nothing in devtools, `tsc` or the other tests
 *    notices -- only opening the PNG does. A static assertion is the only
 *    cheap guard, so these are written to fail loudly on reintroduction.
 */

// `t` returns the key, so assertions name the key rather than English prose.
mock.module("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { exists: () => false, t: (k: string) => k },
	}),
}));

/** Every element in a rendered card, including the root. */
const allElements = (container: HTMLElement): HTMLElement[] => [
	...(container.querySelectorAll("*") as NodeListOf<HTMLElement>),
];

/**
 * The inline style declarations of every element, as raw text.
 *
 * Read via `getAttribute("style")` rather than the `CSSStyleDeclaration`,
 * because happy-dom's CSS parser *silently discards* declarations it cannot
 * parse: `color: oklch(...)` leaves `style.color === ""` and never appears in
 * `cssText`, so a mutation test proved the declaration-based assertions miss
 * exactly the modern colour syntaxes they exist to catch. The attribute is
 * also the more faithful source -- it is the text React wrote and html2canvas
 * copies into its clone, with no test-DOM re-parsing in between.
 */
const rawInlineStyles = (container: HTMLElement): string[] =>
	allElements(container).map((el) => el.getAttribute("style") ?? "");

describe("shareCardFileName", () => {
	test("folds diacritics rather than dropping the letter", () => {
		// NFD + combining-mark strip, so `é` becomes `e` and not nothing.
		expect(shareCardFileName("Cécile")).toBe("birthday-card-cecile.png");
		expect(shareCardFileName("Dorothée")).toBe("birthday-card-dorothee.png");
	});

	test("strips everything outside [a-z0-9]", () => {
		// A `/` in a download attribute is a path separator in some browsers.
		expect(shareCardFileName("a/b\\c:d")).toBe("birthday-card-abcd.png");
		// `&` and spaces survive a URL but not a filename.
		expect(shareCardFileName("Brigitte & Julien")).toBe(
			"birthday-card-brigittejulien.png",
		);
		expect(shareCardFileName("Christian (kiki)")).toBe(
			"birthday-card-christiankiki.png",
		);
	});

	test("is always a .png with a non-empty stem", () => {
		for (const name of ["", "   ", "🎂", "🎂🎂", "---", "& & &"]) {
			const out = shareCardFileName(name);
			expect(out.endsWith(".png")).toBe(true);
			expect(out.length).toBeGreaterThan("birthday-card.png".length - 4);
		}
		expect(shareCardFileName("🎂")).toBe("birthday-card.png");
		expect(shareCardFileName("")).toBe("birthday-card.png");
	});

	test("cannot escape the download directory", () => {
		// The old code interpolated the raw name; a name that is all path
		// segments must not survive as one.
		const out = shareCardFileName("../../etc/passwd");
		expect(out).toBe("birthday-card-etcpasswd.png");
		expect(out).not.toContain("/");
		expect(out).not.toContain("..");
	});
});

describe("ShareCard", () => {
	const record = birthdays[0] as Birthday;
	const renderCard = () => render(card(record));

	test("is a fixed portrait canvas", () => {
		const { container } = renderCard();
		const root = container.firstElementChild as HTMLElement;
		expect(root.style.width).toBe(`${SHARE_CARD_WIDTH}px`);
		expect(root.style.height).toBe(`${SHARE_CARD_HEIGHT}px`);
		expect(SHARE_CARD_WIDTH).toBeLessThan(SHARE_CARD_HEIGHT);
		expect(SHARE_CARD_WIDTH / SHARE_CARD_HEIGHT).toBeCloseTo(2 / 3, 2);
	});

	test("paints its own opaque background at both luminance extremes", () => {
		// A near-white card vanishes into a light chat bubble; a near-black one
		// vanishes into a dark bubble. The mat is what separates the card from a
		// dark background, the gradient field from a light one.
		const { container } = renderCard();
		const root = container.firstElementChild as HTMLElement;
		expect(root.style.background).toBe("#f2e9dc");
		const field = root.firstElementChild as HTMLElement;
		expect(field.style.background).toContain("linear-gradient");
		expect(field.style.color).toBe("#f6efe3");
	});

	test("forwards a ref to the node html2canvas is pointed at", () => {
		let node: HTMLDivElement | null = null;
		render(
			cardWithRef(record, (el) => {
				node = el;
			}),
		);
		expect(node).not.toBeNull();
		expect((node as unknown as HTMLElement).tagName).toBe("DIV");
		expect((node as unknown as HTMLElement).style.width).toBe(
			`${SHARE_CARD_WIDTH}px`,
		);
	});

	test("carries no CSS variables", () => {
		// html2canvas reads getComputedStyle, so a `var()` resolves to whatever
		// the current theme says -- exactly the coupling this card avoids.
		const { container } = renderCard();
		expect(container.innerHTML).not.toContain("var(");
		for (const style of rawInlineStyles(container)) {
			expect(style).not.toContain("var(");
		}
	});

	test("uses no filter, which silently drops a whole subtree", () => {
		const { container } = renderCard();
		for (const style of rawInlineStyles(container)) {
			expect(style).not.toMatch(/(^|[;"\s])filter\s*:/);
			expect(style).not.toMatch(/(^|[;"\s])backdrop-filter\s*:/);
			expect(style).not.toMatch(/-webkit-backdrop-filter\s*:/);
			// A `filter` on an ancestor is the classic way an export goes blank;
			// an `opacity` under 1 is the other, and html2canvas drops either.
			expect(style).not.toMatch(/(^|[;"\s])opacity\s*:/);
		}
	});

	test("uses no gradient html2canvas cannot parse", () => {
		// html2canvas only knows linear- and radial-gradient; a conic-gradient
		// is not in its table and the element paints as nothing.
		const { container } = renderCard();
		for (const style of rawInlineStyles(container)) {
			expect(style).not.toContain("conic-gradient");
		}
		// And the gradient it does rely on is one it can actually parse.
		const field = (container.firstElementChild as HTMLElement)
			.firstElementChild as HTMLElement;
		expect(field.getAttribute("style")).toContain("linear-gradient");
	});

	test("uses no colour function html2canvas cannot parse", () => {
		// Its colour parser handles hex, rgb()/rgba(), hsl()/hsla() and the CSS
		// named colours, and throws on the modern space-separated forms.
		//
		// Checked against the *source*, not just the rendered DOM: React drops
		// a value it cannot parse (a `color: "oklch(...)"` never reaches the
		// style attribute at all), so a DOM-only assertion cannot see the
		// mistake -- it just silently leaves the text unpainted, which is the
		// same blank-export bug wearing a different hat. Comments are stripped
		// first, because the file documents these functions by name.
		const source = readFileSync(SHARE_CARD_SOURCE, "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/.*$/gm, "");
		for (const fn of BANNED_COLOUR_FUNCTIONS) {
			expect(source).not.toContain(fn);
		}
		// Belt and braces: whatever survives into the DOM is checked too.
		const { container } = renderCard();
		for (const style of rawInlineStyles(container)) {
			for (const fn of BANNED_COLOUR_FUNCTIONS) {
				expect(style).not.toContain(fn);
			}
		}
	});

	test("sets an explicit font stack rather than inheriting the page's", () => {
		// html2canvas copies the capture iframe's computed font; an inherited
		// one would tie the PNG to whatever the app had loaded at capture time.
		const { container } = renderCard();
		const root = container.firstElementChild as HTMLElement;
		expect(root.style.fontFamily).toContain("sans-serif");
	});

	test("keeps every colour literal (no var()) after a theme change", () => {
		// The export must not depend on `store.darkMode`; asserting the card
		// carries no theme reads at all is the static form of that.
		const { container } = renderCard();
		for (const style of rawInlineStyles(container)) {
			expect(style).not.toContain("var(");
		}
	});

	test("shows the name and every fact it is meant to communicate", () => {
		const { container } = renderCard();
		// `&` is escaped in the serialised markup but not in the text.
		expect(container.textContent).toContain(record.name);
		const html = container.innerHTML;
		for (const key of [
			`data.zodiac.${record.sign}`,
			`data.birthgems.${record.birthgem}`,
			`data.chinese_zodiac.${record.chineseZodiac}`,
			`data.moon_phases.${record.moonPhase}`,
			`data.insights.${record.dailyInsight}`,
			`data.life_path.${record.lifePathMeaning}`,
			`data.zodiac_traits.${record.sign}`,
			"app.timeline.turns",
			"app.title",
		]) {
			expect(html).toContain(key);
		}
		// The numbers are the point of the card; they must not be dropped.
		expect(html).toContain(record.distanceTraveled.toLocaleString());
		expect(html).toContain(record.heartbeats.toLocaleString());
		expect(html).toContain(String(record.lifePathNumber));
	});

	test("renders for every record in the dataset without throwing", () => {
		// Long names, weddings, and the full range of translated values all
		// have to survive; a throw here would blank the export for that row.
		for (const r of birthdays) {
			const { container, unmount } = render(card(r));
			expect(container.firstElementChild).not.toBeNull();
			expect(container.textContent).toContain(r.name);
			unmount();
		}
	});
});
