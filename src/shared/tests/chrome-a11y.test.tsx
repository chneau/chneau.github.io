import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { ALL_APPS } from "../apps";
import { AppSwitcher, HeaderAction, SchemeToggle } from "../index";

afterEach(() => cleanup());

/**
 * Page-level and layout-dependent rules don't apply to a rendered fragment in
 * a headless DOM, so we silence them and assert on the component-level rules.
 */
const DISABLED_RULES = [
	"color-contrast",
	"page-has-heading-one",
	"landmark-one-main",
	"region",
	"html-has-lang",
	"document-title",
	"bypass",
	"meta-viewport",
];

const provider = (ui: ReactNode) => <MantineProvider>{ui}</MantineProvider>;

const expectNoViolations = async (container: HTMLElement) => {
	const results = await axe.run(container, {
		rules: Object.fromEntries(
			DISABLED_RULES.map((id) => [id, { enabled: false }]),
		),
	});
	const summary = results.violations.map(
		(violation) =>
			`${violation.id}: ${violation.help} -> ${violation.nodes
				.map((node) => `${node.target.join(" ")} | ${node.html}`)
				.join(", ")}`,
	);
	expect(summary).toEqual([]);
};

describe("AppSwitcher a11y", () => {
	test("the trigger exposes its menu contract and the open menu is labelled", () => {
		const view = render(provider(<AppSwitcher current="/" />));

		const trigger = view.getByRole("button", { name: "Switch app" });
		expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
		expect(trigger.getAttribute("aria-expanded")).toBe("false");

		fireEvent.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");

		expect(view.getByRole("menu", { name: "Switch app" })).toBeDefined();
		const items = view.getAllByRole("menuitem");
		expect(items).toHaveLength(ALL_APPS.length);
		for (const item of items) {
			expect(item.getAttribute("href")).toBeTruthy();
		}
	});

	test("marks the current app with aria-current", () => {
		const view = render(provider(<AppSwitcher current="/" />));
		fireEvent.click(view.getByRole("button", { name: "Switch app" }));

		const dashboard = view.getByRole("menuitem", { name: /Dashboard/ });
		expect(dashboard.getAttribute("aria-current")).toBe("page");
		expect(
			view
				.getByRole("menuitem", { name: /Spooners/ })
				.getAttribute("aria-current"),
		).toBeNull();
	});

	test("has no detectable axe violations when open", async () => {
		const view = render(provider(<AppSwitcher current="/spooners/" />));
		fireEvent.click(view.getByRole("button", { name: "Switch app" }));
		await expectNoViolations(view.baseElement);
	});
});

describe("HeaderAction a11y", () => {
	test("exposes labels, pressed state, links and busy state", () => {
		const view = render(
			provider(
				<>
					<HeaderAction label="Settings" icon={<span />} />
					<HeaderAction label="Favourite" icon={<span />} ariaPressed />
					<HeaderAction label="Documentation" href="/docs/" icon={<span />} />
					<HeaderAction label="Saving" icon={<span />} loading />
					<HeaderAction label="Offline" icon={<span />} disabled />
				</>,
			),
		);

		expect(view.getByRole("button", { name: "Settings" })).toBeDefined();

		const pressed = view.getByRole("button", { name: "Favourite" });
		expect(pressed.getAttribute("aria-pressed")).toBe("true");

		const link = view.getByRole("link", { name: "Documentation" });
		expect(link.getAttribute("href")).toBe("/docs/");

		const busy = view.getByRole("button", { name: "Saving" });
		expect(busy.getAttribute("aria-busy")).toBe("true");
		expect((busy as HTMLButtonElement).disabled).toBe(true);

		const offline = view.getByRole("button", { name: "Offline" });
		expect((offline as HTMLButtonElement).disabled).toBe(true);
	});

	test("has no detectable axe violations", async () => {
		const view = render(
			provider(
				<HeaderAction label="Open menu" ariaHaspopup="menu" icon={<span />} />,
			),
		);
		await expectNoViolations(view.container);
	});
});

describe("SchemeToggle a11y", () => {
	test("labels the action by the scheme it switches to", () => {
		const calls: number[] = [];
		const view = render(
			provider(<SchemeToggle dark onToggle={() => calls.push(1)} />),
		);

		// In dark mode the control offers light mode.
		fireEvent.click(view.getByRole("button", { name: "Light mode" }));
		expect(calls).toEqual([1]);

		view.rerender(provider(<SchemeToggle dark={false} onToggle={() => {}} />));
		expect(view.getByRole("button", { name: "Dark mode" })).toBeDefined();
	});

	test("has no detectable axe violations in both schemes", async () => {
		const view = render(provider(<SchemeToggle dark onToggle={() => {}} />));
		await expectNoViolations(view.container);
		view.rerender(provider(<SchemeToggle dark={false} onToggle={() => {}} />));
		await expectNoViolations(view.container);
	});
});
