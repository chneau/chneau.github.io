import { describe, expect, test } from "bun:test";
import { addItems } from "../lib/add-item";
import { decompressContainer, parseContainer } from "../lib/container";
import { playerInventory } from "../lib/inventory";
import { readNameTable } from "../lib/names";
import { readObjectTree } from "../lib/objects";
import { FIXTURE_TIMEOUT_MS, largeSave } from "./fixtures";

/**
 * The one resizing operation: a record really is inserted, the name is appended
 * to `MANU`, and the `SC` span index still resolves to the same object graph.
 * Whether the game loads the result is not something a test here can prove.
 */
describe("adding an item", () => {
	test(
		"inserts a record, appends the name and keeps the span index consistent",
		() => {
			const container = decompressContainer(largeSave());
			const before = playerInventory(container.data) ?? [];
			const rootsBefore = readObjectTree(container.data).roots.length;

			const file = addItems(container, [
				{
					name: "Greater mutagen red",
					quantity: 50,
					template: "Greater mutagen blue",
				},
			]);

			const back = decompressContainer(file);
			const after = playerInventory(back.data) ?? [];
			expect(after.length).toBe(before.length + 1);
			expect(
				after.find((item) => item.name === "Greater mutagen red")?.quantity,
			).toBe(50);
			// The rebuilt stream is self-consistent: the same object graph resolves.
			expect(readNameTable(back.data).names).toContain("Greater mutagen red");
			expect(readObjectTree(back.data).roots.length).toBe(rootsBefore);
			// The input is untouched.
			expect((playerInventory(container.data) ?? []).length).toBe(
				before.length,
			);
			// The chunk table keeps the game's shape: every chunk but the last
			// decompresses to the same unit (1 MiB). Growing the chunk an insert
			// landed in produced a save the game refused to load.
			const sizes = parseContainer(file).chunks.map((c) => c.decompressedSize);
			expect(sizes.length).toBeGreaterThan(1);
			expect(sizes.slice(0, -1).every((size) => size === sizes[0])).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);
});
