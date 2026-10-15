import { describe, expect, test } from "bun:test";
import { addItems } from "../lib/add-item";
import { decompressContainer, parseContainer } from "../lib/container";
import { playerInventory } from "../lib/inventory";
import { readNameTable } from "../lib/names";
import { readObjectTree } from "../lib/objects";
import { FIXTURE_TIMEOUT_MS, largeSave } from "./fixtures";

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
			expect(readNameTable(back.data).names).toContain("Greater mutagen red");
			expect(readObjectTree(back.data).roots.length).toBe(rootsBefore);
			expect((playerInventory(container.data) ?? []).length).toBe(
				before.length,
			);
			const sizes = parseContainer(file).chunks.map((c) => c.decompressedSize);
			expect(sizes.length).toBeGreaterThan(1);
			expect(sizes.slice(0, -1).every((size) => size === sizes[0])).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);
});
