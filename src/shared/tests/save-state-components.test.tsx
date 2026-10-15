import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { ConfirmDialog } from "../save/components/ConfirmDialog";

afterEach(() => cleanup());

const provider = (ui: ReactNode) => <MantineProvider>{ui}</MantineProvider>;

describe("LoadingState", () => {
	test("announces politely, is busy, and shows its label", () => {
		const view = render(provider(<LoadingState label="Reading save" />));

		const region = view.getByRole("status");
		expect(region.getAttribute("aria-live")).toBe("polite");
		expect(region.getAttribute("aria-busy")).toBe("true");
		expect(region.textContent).toContain("Reading save");
		expect(region.querySelector(".sr-only")).toBeNull();
	});

	test("hideLabel keeps the text for assistive technology only", () => {
		const view = render(
			provider(<LoadingState label="Reading save" hideLabel />),
		);

		const region = view.getByRole("status");
		expect(region.textContent).toContain("Reading save");
		expect(region.querySelector(".sr-only")).not.toBeNull();
	});

	test("renders its placeholders inside the live region", () => {
		const view = render(
			provider(
				<LoadingState label="Reading save">
					<span data-testid="placeholder" />
				</LoadingState>,
			),
		);

		expect(
			view.getByRole("status").contains(view.getByTestId("placeholder")),
		).toBe(true);
	});
});

describe("ErrorState", () => {
	test("is an assertive alert carrying the title and body", () => {
		const view = render(
			provider(
				<ErrorState title="Could not read that save" body="Bad header" />,
			),
		);

		const alert = view.getByRole("alert");
		expect(alert.textContent).toContain("Could not read that save");
		expect(alert.textContent).toContain("Bad header");
	});

	test("renders the heading label and the recovery action when given", () => {
		let clicks = 0;
		const view = render(
			provider(
				<ErrorState
					title="Could not read that save"
					label={<h1>Save editor</h1>}
					action={
						<button type="button" onClick={() => (clicks += 1)}>
							Try another file
						</button>
					}
				/>,
			),
		);

		expect(view.getByRole("alert").querySelector("h1")?.textContent).toBe(
			"Save editor",
		);
		fireEvent.click(view.getByRole("button", { name: "Try another file" }));
		expect(clicks).toBe(1);
	});
});

const DIALOG = {
	opened: true,
	title: "Leave this save?",
	body: "Your staged changes have not been written to a file yet.",
	confirmLabel: "Leave anyway",
	cancelLabel: "Stay",
	dangerous: true,
};

describe("ConfirmDialog", () => {
	test("the confirm path calls only onConfirm", () => {
		let confirmed = 0;
		let cancelled = 0;
		const view = render(
			provider(
				<ConfirmDialog
					{...DIALOG}
					onCancel={() => {
						cancelled += 1;
					}}
					onConfirm={() => {
						confirmed += 1;
					}}
				/>,
			),
		);

		fireEvent.click(view.getByRole("button", { name: "Leave anyway" }));

		expect(confirmed).toBe(1);
		expect(cancelled).toBe(0);
	});

	test("the cancel path calls only onCancel", () => {
		let confirmed = 0;
		let cancelled = 0;
		const view = render(
			provider(
				<ConfirmDialog
					{...DIALOG}
					onCancel={() => {
						cancelled += 1;
					}}
					onConfirm={() => {
						confirmed += 1;
					}}
				/>,
			),
		);

		fireEvent.click(view.getByRole("button", { name: "Stay" }));

		expect(cancelled).toBe(1);
		expect(confirmed).toBe(0);
	});

	test("cancelLabel defaults to Cancel when none is given", () => {
		const view = render(
			provider(
				<ConfirmDialog
					opened
					title={DIALOG.title}
					body={DIALOG.body}
					confirmLabel={DIALOG.confirmLabel}
					dangerous
					onCancel={() => {}}
					onConfirm={() => {}}
				/>,
			),
		);

		expect(view.getByRole("button", { name: "Cancel" })).not.toBeNull();
	});
});
