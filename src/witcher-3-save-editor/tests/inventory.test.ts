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

const declaredCount = (
	data: Uint8Array,
	firstRecordOffset: number,
): number | undefined => {
	const at = firstRecordOffset - 15;
	if (at < 0 || at + 2 > data.length) return undefined;
	return new DataView(data.buffer, data.byteOffset + at, 2).getUint16(0, true);
};

const hexOf = (pair: readonly number[]): string =>
	pair.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");

describe("the item record reader", () => {
	test(
		"recovers each build's own tag pair rather than assuming one",
		() => {
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
				expect({
					name,
					pair: pair === undefined ? "none" : hexOf(pair),
				}).toEqual({
					name,
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
			const doc = await witcher3.decode(largeSave());
			const rows = arrayAt(doc, "items") ?? [];
			const values = rows
				.filter(isJsonObject)
				.map((row) => row.durability)
				.filter((value) => value !== undefined);
			expect({
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
