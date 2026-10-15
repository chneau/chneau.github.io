import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import type { Bytes } from "../save/bytes";
import type { JsonValue } from "../save/json";
import type { SaveCodec, SaveEdit } from "../save/types";
import { useSaveDocument } from "../save/useSaveDocument";

afterEach(() => cleanup());

const CODEC: SaveCodec = {
	game: "Sample",
	formatLabel: "Sample format",
	extensions: ["sav"],
	defaultPath: "Documents/Sample",
	notes: [],
	decode: async (): Promise<JsonValue> => ({}),
	encode: async (): Promise<Bytes> => new Uint8Array(),
	summarise: () => [],
	actions: [],
};

const EDIT: SaveEdit = {
	id: "edit-1",
	label: "Name",
	path: ["name"],
	before: "before",
	after: "after",
};

const mount = () => {
	let current: ReturnType<typeof useSaveDocument> | null = null;
	const Probe = () => {
		current = useSaveDocument(CODEC);
		return null;
	};
	render(<Probe />);
	const read = () => {
		if (current === null) throw new Error("the probe never rendered");
		return current;
	};
	return read;
};

const fireBeforeUnload = (): Event => {
	const event = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(event);
	return event;
};

describe("useSaveDocument unsaved-work guard", () => {
	test("does not warn while nothing is staged", () => {
		mount();

		expect(fireBeforeUnload().defaultPrevented).toBe(false);
	});

	test("warns while an edit is staged and stops once the edits are cleared", () => {
		const read = mount();

		act(() => read().stage(EDIT));
		expect(fireBeforeUnload().defaultPrevented).toBe(true);

		act(() => read().clearEdits());
		expect(fireBeforeUnload().defaultPrevented).toBe(false);
	});

	test("warns again for a second staged edit", () => {
		const read = mount();

		act(() => read().stage(EDIT));
		expect(fireBeforeUnload().defaultPrevented).toBe(true);

		act(() => read().stage({ ...EDIT, id: "edit-2", path: ["other"] }));
		expect(fireBeforeUnload().defaultPrevented).toBe(true);
	});

	test("reverting the last edit releases the guard", () => {
		const read = mount();

		act(() => read().stage(EDIT));
		act(() => read().revert(EDIT.path));
		expect(read().edits).toHaveLength(0);
		expect(fireBeforeUnload().defaultPrevented).toBe(false);
	});

	test("the guard is detached on unmount", () => {
		const read = mount();
		act(() => read().stage(EDIT));

		cleanup();

		expect(fireBeforeUnload().defaultPrevented).toBe(false);
	});
});
