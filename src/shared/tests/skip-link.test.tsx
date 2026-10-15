import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SkipLink } from "../components/SkipLink";

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

const mountMain = (tabindex?: string) => {
	document.body.innerHTML = "";
	const main = document.createElement("main");
	main.id = "main";
	if (tabindex !== undefined) main.setAttribute("tabindex", tabindex);
	document.body.append(main);
	return main;
};

describe("SkipLink", () => {
	test("clicking moves focus to the target", () => {
		const main = mountMain();
		render(<SkipLink />);
		fireEvent.click(document.querySelector("a.app-skip-link") ?? main);
		expect(document.activeElement).toBe(main);
	});

	test("the injected tabindex is -1, so the landmark stays out of the tab order", () => {
		const main = mountMain();
		render(<SkipLink />);
		fireEvent.click(document.querySelector("a") ?? main);
		expect(main.getAttribute("tabindex")).toBe("-1");
	});

	test("an existing tabindex is preserved, not clobbered", () => {
		for (const existing of ["-1", "0"]) {
			const main = mountMain(existing);
			render(<SkipLink />);
			fireEvent.click(document.querySelector("a") ?? main);
			expect(main.getAttribute("tabindex")).toBe(existing);
			expect(document.activeElement).toBe(main);
			cleanup();
			document.body.innerHTML = "";
		}
	});

	test("a target that does not exist is inert: no throw, focus unchanged", () => {
		document.body.innerHTML = "";
		const elsewhere = document.createElement("input");
		document.body.append(elsewhere);
		elsewhere.focus();
		render(<SkipLink targetId="not-rendered-yet" />);
		const link = document.querySelector("a.app-skip-link");
		expect(() => fireEvent.click(link ?? elsewhere)).not.toThrow();
		expect(document.activeElement).toBe(elsewhere);
	});

	test("a custom targetId is honoured in both the href and the focused element", () => {
		document.body.innerHTML = "";
		const main = document.createElement("main");
		main.id = "main";
		const content = document.createElement("div");
		content.id = "content";
		document.body.append(main, content);
		render(<SkipLink targetId="content" />);
		const link = document.querySelector("a.app-skip-link");
		expect(link?.getAttribute("href")).toBe("#content");
		fireEvent.click(link ?? content);
		expect(document.activeElement).toBe(content);
		expect(content.getAttribute("tabindex")).toBe("-1");
	});

	test("it does not preventDefault, so the browser also scrolls to the fragment", () => {
		mountMain();
		render(<SkipLink />);
		const link = document.querySelector("a.app-skip-link");
		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		link?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
	});

	test("the link is a real anchor with an accessible name, not a bare handler", () => {
		mountMain();
		render(<SkipLink />);
		const link = document.querySelector("a.app-skip-link");
		expect(link?.tagName).toBe("A");
		expect(link?.textContent?.trim()).toBe("Skip to content");
	});
});
