import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import type { Bytes } from "../save/bytes";
import type { JsonValue } from "../save/json";
import type { SaveCodec, SaveEdit } from "../save/types";
import { useSaveDocument } from "../save/useSaveDocument";

/**
 * The unsaved-work guard.
 *
 * A staged edit is work the file on disk does not have, so leaving the tab with
 * one staged has to warn — and a save with nothing staged must *not* warn, or
 * every read-only visit to a save editor prompts the reader to leave a page they
 * are only reading. The guard is an effect keyed on the number of staged edits,
 * so both directions are asserted here rather than reasoned about.
 */

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

/**
 * A probe holding the hook's own value.
 *
 * The tests act on the hook's `stage` / `clearEdits`, which is what the
 * workbench drives, rather than on a hand-set edit list — a list set from
 * outside would pass even if the guard never re-ran on a change.
 */
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
