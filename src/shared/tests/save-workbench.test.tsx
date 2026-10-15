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

		const picker = view.getByRole("button", { name: "Choose save file" });
		expect(picker.tagName).toBe("BUTTON");

		const input =
			view.container.querySelector<HTMLInputElement>('input[type="file"]');
		expect(input).not.toBeNull();
		if (!input) return;

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
