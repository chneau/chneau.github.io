import { describe, expect, test } from "bun:test";
import { arrayAt, isJsonObject } from "../../shared";
import { decompressContainer } from "../lib/container";
import { witcher3 } from "../lib/format";
import {
	discoverTagPair,
	playerInventory,
	readContainers,
} from "../lib/inventory";
import { readNameTable } from "../lib/names";
import { readObjectTree } from "../lib/objects";
import { parseTokens } from "../lib/tokens";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

/**
 * The item record reader, against the two committed fixtures.
 *
 * Two properties are asserted here that no other suite covers, both of them
 * regressions this reader actually had:
 *
 *  1. **The tag pair is discovered.** It is per build, not per save version —
 *    `8559a` and `52586` share the version `66/29/164` and use different pairs.
 *    Requiring one build's pair read *zero* items out of the other fixture.
 *  2. **Durability does not filter records.** The anchor test used to require
 *    `f32 -1.0`, the engine's "no durability" sentinel, which dropped every item
 *    that had a real durability value.
 *
 * Both are measured against each fixture's own declared record counts, which is
 * the strongest statement available: the reader agrees with the number the save
 * states about itself rather than with a figure remembered from a run.
 */

/**
 * The count a container declares for its own record list.
 *
 * The list's first record starts 13 bytes after its `nameIdx`, and the `u16`
 * count sits two bytes *before* that name index — so this is measured from the
 * first record the reader found rather than from the frame's start, which
 * carries the `BS entityData` header instead.
 */
const declaredCount = (
	data: Uint8Array,
	firstRecordOffset: number,
): number | undefined => {
	const at = firstRecordOffset - 15;
	if (at < 0 || at + 2 > data.length) return undefined;
	return new DataView(data.buffer, data.byteOffset + at, 2).getUint16(0, true);
};

/** A tag pair as the hex text a test can compare without an array union. */
const hexOf = (pair: readonly number[]): string =>
	pair.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");

describe("the item record reader", () => {
	test(
		"recovers each build's own tag pair rather than assuming one",
		() => {
			// The pairs are asserted as literal bytes, not recomputed from the data
			// they are read out of — a test that derived the expected value the same
			// way the code does would pass on a reader that returned nonsense.
			const expected: readonly (readonly [string, readonly number[]])[] = [
				["8559a", [0x76, 0x00, 0x77, 0x00]],
				["52586", [0x72, 0x00, 0x74, 0x00]],
			];
			for (const [name, bytes] of [
				["8559a", smallSave()],
				["52586", largeSave()],
			] as const) {
				const data = decompressContainer(bytes).data;
				const names = readNameTable(data).names;
				const pair = discoverTagPair(data, names);
				const wanted = expected.find(([key]) => key === name)?.[1];
				// Both sides are hex text rather than arrays, so the comparison is
				// between two strings of the same shape. An array against an optional
				// array makes `toEqual` infer through a union and fail to typecheck
				// for a reason that has nothing to do with the reader.
				expect({
					name,
					pair: pair === undefined ? "none" : hexOf(pair),
				}).toEqual({
					name,
					// `wanted` is `undefined` only if a fixture name is missing from
					// the table above — a bug in this test, and the text says so.
					pair:
						wanted === undefined ? "no expectation recorded" : hexOf(wanted),
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"finds every record the save declares, on both builds",
		() => {
			// The player's own list is the one whose declared count is unambiguous,
			// because the frame is identified structurally (the frame holding
			// `levelManager`) rather than by being the largest.
			for (const [name, bytes, expected] of [
				["8559a", smallSave(), 164],
				["52586", largeSave(), 626],
			] as const) {
				const data = decompressContainer(bytes).data;
				const items = playerInventory(data) ?? [];
				const first = items[0];
				expect({
					name,
					read: items.length,
					declared:
						first === undefined
							? "no records"
							: declaredCount(data, first.offset),
				}).toEqual({ name, read: expected, declared: expected });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reads durability instead of dropping the items that carry it",
		() => {
			// The regression this suite exists for. Requiring `f32 -1.0` to recognise
			// a record dropped 11 of the large save's 626 — the player's own sword and
			// armour — and 543 of its 2,009 container records.
			for (const [name, bytes, expected] of [
				["8559a", smallSave(), 10],
				["52586", largeSave(), 11],
			] as const) {
				const items = playerInventory(decompressContainer(bytes).data) ?? [];
				const durable = items.filter((item) => item.durability !== null);
				expect({ name, durable: durable.length }).toEqual({
					name,
					durable: expected,
				});
				// Every one is a plausible fraction of a weapon's or armour's life,
				// never the sentinel itself and never nonsense.
				//
				// `inRange` is an **actual** value, unlike before: this compared the
				// same expression to itself on both sides, and the whole suite stayed
				// green with every durability set to `-2`. The filter above removes the
				// `null`s, so `durability` is a number here.
				for (const item of durable) {
					const durability = item.durability;
					if (durability === null) {
						throw new Error(`${item.name} survived the null filter`);
					}
					expect({
						name: item.name,
						inRange: durability > 0 && durability < 1000,
					}).toEqual({ name: item.name, inRange: true });
				}
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reports no durability as null rather than as a number",
		async () => {
			// `-1.0` is the engine's own "this item has none" sentinel, so `null` is
			// the honest rendering. A `-1` in the document would read as a quantity or
			// a damage value, and the inspector would offer to edit it.
			const doc = await witcher3.decode(largeSave());
			const rows = arrayAt(doc, "items") ?? [];
			const values = rows
				.filter(isJsonObject)
				.map((row) => row.durability)
				.filter((value) => value !== undefined);
			expect({
				// Nothing in the document holds the raw sentinel.
				negative: values.filter(
					(value) => typeof value === "number" && value < 0,
				).length,
				nulls: values.filter((value) => value === null).length,
				numbers: values.filter((value) => typeof value === "number").length,
			}).toEqual({ negative: 0, nulls: 615, numbers: 11 });
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"a shared scan gives byte-identical containers to a private one",
		() => {
			// `readContainers` takes an optional token walk and object tree so the
			// codec does not rebuild either. That is a performance path, so a bug in
			// it would change *what* is read, not raise anything — and the labels
			// especially, since the idTag-to-span attribution is now a single merge
			// over the tokens rather than a scan per span.
			for (const bytes of [smallSave(), largeSave()]) {
				const data = decompressContainer(bytes).data;
				const names = readNameTable(data).names;
				const tokens = parseTokens(data, names).tokens;
				const roots = readObjectTree(data).roots;
				expect(readContainers(data, names, tokens, roots)).toEqual(
					readContainers(data),
				);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reads the whole save's containers, not only the player's",
		() => {
			// 27.0% of the large save's container records were being dropped by the
			// durability filter, which gutted merchant inventories: one container in
			// the source decoder's measurements lost 253 of its 275 records.
			for (const [name, bytes, expected] of [
				["8559a", smallSave(), 697],
				["52586", largeSave(), 2009],
			] as const) {
				const data = decompressContainer(bytes).data;
				const total = readContainers(data).reduce(
					(sum, container) => sum + container.items.length,
					0,
				);
				expect({ name, total }).toEqual({ name, total: expected });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);
});
