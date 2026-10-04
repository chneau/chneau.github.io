import { axeFragmentOptions } from "./axe-fragment";
import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import axe from "axe-core";
import { Rocket } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { AppCard, type AppEntry } from "../index";

afterEach(() => cleanup());

const provider = (ui: ReactNode) => <MantineProvider>{ui}</MantineProvider>;

const expectNoViolations = async (container: HTMLElement) => {
	const results = await axe.run(container, {
		rules: axeFragmentOptions().rules,
	});
	const summary = results.violations.map(
		(violation) =>
			`${violation.id}: ${violation.help} -> ${violation.nodes
				.map((node) => `${node.target.join(" ")} | ${node.html}`)
				.join(", ")}`,
	);
	expect(summary).toEqual([]);
};

const ITEM: AppEntry = {
	href: "/sample/",
	icon: Rocket,
	title: "Sample App",
	tag: "Demo",
	tagColor: "blue",
	category: "Meta",
	shortcutKey: "Press 7",
	hotkey: "7",
	description: "A deterministic sample entry for the tests.",
};

describe("AppCard a11y", () => {
	test("the surface is a single link with a descriptive label", () => {
		const view = render(provider(<AppCard item={ITEM} />));

		const link = view.getByRole("link", {
			name: "Open Sample App — Demo",
		});
		expect(link.getAttribute("href")).toBe("/sample/");
	});

	test("the pin button aria-pressed follows the pinned prop", () => {
		const view = render(
			provider(<AppCard item={ITEM} pinned={false} onTogglePin={() => {}} />),
		);

		const pin = view.getByRole("button", { name: "Pin Sample App" });
		expect(pin.getAttribute("aria-pressed")).toBe("false");

		view.rerender(
			provider(<AppCard item={ITEM} pinned onTogglePin={() => {}} />),
		);

		const unpin = view.getByRole("button", { name: "Unpin Sample App" });
		expect(unpin.getAttribute("aria-pressed")).toBe("true");
	});

	test("clicking the pin toggles the state and reports the href", () => {
		const calls: string[] = [];
		const Harness = () => {
			const [pinned, setPinned] = useState(false);
			return (
				<AppCard
					item={ITEM}
					pinned={pinned}
					onTogglePin={(href) => {
						calls.push(href);
						setPinned((value) => !value);
					}}
				/>
			);
		};

		const view = render(provider(<Harness />));

		fireEvent.click(view.getByRole("button", { name: "Pin Sample App" }));

		expect(calls).toEqual(["/sample/"]);
		const unpin = view.getByRole("button", { name: "Unpin Sample App" });
		expect(unpin.getAttribute("aria-pressed")).toBe("true");

		fireEvent.click(unpin);

		expect(calls).toEqual(["/sample/", "/sample/"]);
		const pin = view.getByRole("button", { name: "Pin Sample App" });
		expect(pin.getAttribute("aria-pressed")).toBe("false");
	});

	test("has no detectable axe violations", async () => {
		const view = render(
			provider(
				<AppCard
					item={ITEM}
					pinned
					lastVisitedAt={Date.now()}
					onTogglePin={() => {}}
					onVisit={() => {}}
				/>,
			),
		);
		await expectNoViolations(view.container);
	});
});
