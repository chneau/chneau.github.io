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

const card = (record: Birthday) => createElement(ShareCard, { record });
const cardWithRef = (
	record: Birthday,
	ref: (el: HTMLDivElement | null) => void,
) => createElement(ShareCard, { record, ref });

const SHARE_CARD_SOURCE = new URL("../ShareCard.tsx", import.meta.url).pathname;

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

mock.module("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { exists: () => false, t: (k: string) => k },
	}),
}));

const allElements = (container: HTMLElement): HTMLElement[] => [
	...(container.querySelectorAll("*") as NodeListOf<HTMLElement>),
];

const rawInlineStyles = (container: HTMLElement): string[] =>
	allElements(container).map((el) => el.getAttribute("style") ?? "");

describe("shareCardFileName", () => {
	test("folds diacritics rather than dropping the letter", () => {
		expect(shareCardFileName("Cécile")).toBe("birthday-card-cecile.png");
		expect(shareCardFileName("Dorothée")).toBe("birthday-card-dorothee.png");
	});

	test("strips everything outside [a-z0-9]", () => {
		expect(shareCardFileName("a/b\\c:d")).toBe("birthday-card-abcd.png");
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
			expect(style).not.toMatch(/(^|[;"\s])opacity\s*:/);
		}
	});

	test("uses no gradient html2canvas cannot parse", () => {
		const { container } = renderCard();
		for (const style of rawInlineStyles(container)) {
			expect(style).not.toContain("conic-gradient");
		}
		const field = (container.firstElementChild as HTMLElement)
			.firstElementChild as HTMLElement;
		expect(field.getAttribute("style")).toContain("linear-gradient");
	});

	test("uses no colour function html2canvas cannot parse", () => {
		const source = readFileSync(SHARE_CARD_SOURCE, "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/.*$/gm, "");
		for (const fn of BANNED_COLOUR_FUNCTIONS) {
			expect(source).not.toContain(fn);
		}
		const { container } = renderCard();
		for (const style of rawInlineStyles(container)) {
			for (const fn of BANNED_COLOUR_FUNCTIONS) {
				expect(style).not.toContain(fn);
			}
		}
	});

	test("sets an explicit font stack rather than inheriting the page's", () => {
		const { container } = renderCard();
		const root = container.firstElementChild as HTMLElement;
		expect(root.style.fontFamily).toContain("sans-serif");
	});

	test("keeps every colour literal (no var()) after a theme change", () => {
		const { container } = renderCard();
		for (const style of rawInlineStyles(container)) {
			expect(style).not.toContain("var(");
		}
	});

	test("shows the name and every fact it is meant to communicate", () => {
		const { container } = renderCard();
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
		expect(html).toContain(record.distanceTraveled.toLocaleString());
		expect(html).toContain(record.heartbeats.toLocaleString());
		expect(html).toContain(String(record.lifePathNumber));
	});

	test("renders for every record in the dataset without throwing", () => {
		for (const r of birthdays) {
			const { container, unmount } = render(card(r));
			expect(container.firstElementChild).not.toBeNull();
			expect(container.textContent).toContain(r.name);
			unmount();
		}
	});
});
