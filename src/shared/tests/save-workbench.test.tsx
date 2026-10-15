import "./happy-dom";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { SaveWorkbench } from "../save/components/SaveWorkbench";
import type { SaveCodec } from "../save/types";

/**
 * The workbench's two document states, and the two things that were missing
 * from the second one.
 *
 * This is the shared page of all seven save editors, and until now no test
 * rendered it: the suites cover `useSaveDocument` and the sample decoders, not
 * the markup. Both defects below lived in that gap.
 *
 * - The landing screen's "Choose save file" was a `<span>` inside a `<label>`
 *   that wrapped a `display: none` input: nothing in the subtree was focusable,
 *   so the `onKeyDown` handler that forwarded Enter and Space could never fire
 *   and the page's primary action was pointer-only. Tabbing through the page
 *   reached the skip link, the navbar and `main`, then wrapped.
 * - Loading a save replaced the landing branch, and with it the page's only
 *   `<h1>` and its `<main id="main">` — the element `SkipLink` targets. The
 *   requirement is therefore stated as a property of both branches, so the next
 *   rewrite of either one has to keep it.
 */

afterEach(() => cleanup());

const provider = (ui: ReactNode) => <MantineProvider>{ui}</MantineProvider>;

const SAMPLE_BYTES = new Uint8Array([1, 2, 3, 4]);

const codec: SaveCodec = {
	game: "Sample Game",
	formatLabel: "SAMPLE, XOR 0x00",
	extensions: ["sav"],
	defaultPath: "~/Saved Games/Sample/save.sav",
	notes: [
		{
			title: "How the container works",
			body: "Four bytes, and the last one is not a checksum.",
		},
	],
	decode: async () => ({ gold: 500 }),
	encode: async () => SAMPLE_BYTES,
	summarise: () => [{ label: "Gold", value: "500" }],
	actions: [],
};

const sample = {
	name: "sample.sav",
	note: "A four-byte save, so the page is explorable without one.",
	load: async () => SAMPLE_BYTES,
};

describe("SaveWorkbench landing", () => {
	test("the file picker is a control the keyboard can reach", () => {
		const view = render(provider(<SaveWorkbench codec={codec} />));

		// The query is the assertion: `component="span"` inside a `<label>` has
		// no button role, so this fails on the markup that shipped.
		const picker = view.getByRole("button", { name: "Choose save file" });
		expect(picker.tagName).toBe("BUTTON");

		const input =
			view.container.querySelector<HTMLInputElement>('input[type="file"]');
		expect(input).not.toBeNull();
		if (!input) return;

		// Which is the whole point of it being a button: activating it opens the
		// picker the input is hiding.
		const opened = spyOn(input, "click");
		fireEvent.click(picker);
		expect(opened).toHaveBeenCalledTimes(1);
	});
});

describe("SaveWorkbench workspace", () => {
	test("keeps the main landmark and a page heading once a save is open", async () => {
		const view = render(
			provider(<SaveWorkbench codec={codec} sample={sample} />),
		);

		await act(async () => {
			fireEvent.click(view.getByRole("button", { name: /Load sample/ }));
		});

		// The landing branch's `<h1>` is gone by then; the workspace has to
		// carry its own, and the skip link has to still have a target.
		await waitFor(
			() =>
				expect(view.container.querySelector("h1")?.textContent).toContain(
					"sample.sav",
				),
			{ timeout: 3000 },
		);
		expect(view.container.querySelector("main#main")).not.toBeNull();
	});
});
