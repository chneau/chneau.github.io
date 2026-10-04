import { axeFragmentOptions } from "./axe-fragment";
import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import {
	CommandPalette,
	EmptyState,
	HeaderAction,
	Section,
	ShortcutsHelp,
	Skeleton,
	Stat,
	StatusDot,
} from "../index";

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

describe("shared components a11y", () => {
	test("primitives have no detectable violations", async () => {
		const { container } = render(
			provider(
				<>
					<HeaderAction label="Settings" icon={<span />} />
					<Stat label="Active saves" value="3" />
					<StatusDot label="Live" />
					<EmptyState
						title="No results"
						body="Try a different filter."
						action={
							<button type="button" tabIndex={0}>
								Reset filters
							</button>
						}
					/>
					<Skeleton width={40} />
					<Section title="Overview">
						<p>Body</p>
					</Section>
				</>,
			),
		);
		await expectNoViolations(container);
	});

	test("shortcuts dialog has no detectable violations", async () => {
		const { baseElement } = render(
			provider(
				<ShortcutsHelp
					opened
					onClose={() => {}}
					groups={[
						{
							title: "Page",
							shortcuts: [
								{ keys: ["Esc"], description: "Return to the dashboard" },
							],
						},
					]}
				/>,
			),
		);
		await expectNoViolations(baseElement);
	});

	test("command palette has no detectable violations", async () => {
		const { baseElement } = render(
			provider(
				<CommandPalette
					opened
					onClose={() => {}}
					commands={[{ id: "theme", label: "Toggle theme", run: () => {} }]}
				/>,
			),
		);
		await expectNoViolations(baseElement);
	});
});
