import { describe, expect, test } from "bun:test";
import { stagedEditKeys } from "../lib/staged-edit-keys";
import type { SaveEdit } from "../lib/staged-edits";

const quantity = (
	inventoryKey: number,
	slotNo: number,
	newQuantity: number,
): SaveEdit => ({
	type: "quantity",
	inventoryKey,
	slotNo,
	itemKey: 1000 + slotNo,
	itemName: `item-${slotNo}`,
	expectedQuantity: 1,
	newQuantity,
});

const CHAR_WAREHOUSE = 1;
const CHAR_VAULT = 2;

describe("stagedEditKeys", () => {
	test("keys are unique across distinct edits", () => {
		const keys = stagedEditKeys([
			quantity(CHAR_WAREHOUSE, 0, 5),
			quantity(CHAR_VAULT, 1, 5),
			quantity(CHAR_VAULT, 0, 5),
		]);
		expect(new Set(keys).size).toBe(3);
	});

	test("identical staged edits still get distinct keys", () => {
		const keys = stagedEditKeys([
			quantity(CHAR_WAREHOUSE, 0, 5),
			quantity(CHAR_WAREHOUSE, 0, 5),
		]);
		expect(new Set(keys).size).toBe(2);
	});

	test("removing an earlier edit leaves every later key untouched", () => {
		const edits: SaveEdit[] = [
			quantity(CHAR_WAREHOUSE, 0, 5),
			quantity(CHAR_WAREHOUSE, 1, 7),
			quantity(CHAR_WAREHOUSE, 2, 9),
			quantity(CHAR_WAREHOUSE, 3, 11),
		];
		const before = stagedEditKeys(edits);

		for (const removed of [0, 1, 2, 3]) {
			const survivors = [...edits];
			survivors.splice(removed, 1);
			const after = stagedEditKeys(survivors);

			const expected = before.filter((_, index) => index !== removed);
			expect(after).toEqual(expected);
		}
	});

	test("identical edits are re-keyed among themselves, and that is the limit", () => {
		const edits: SaveEdit[] = [
			quantity(CHAR_WAREHOUSE, 0, 5),
			quantity(CHAR_WAREHOUSE, 0, 5),
			quantity(CHAR_WAREHOUSE, 0, 5),
		];
		const before = stagedEditKeys(edits);
		expect(new Set(before).size).toBe(3);

		const survivors = edits.filter((_, index) => index !== 1);
		const after = stagedEditKeys(survivors);

		expect(new Set(after).size).toBe(2);
		expect(after[0]).toBe(before[0]);
	});

	test("an empty list has no keys, and keys are stable across calls", () => {
		expect(stagedEditKeys([])).toEqual([]);
		const edits = [quantity(CHAR_WAREHOUSE, 0, 5)];
		expect(stagedEditKeys(edits)).toEqual(stagedEditKeys(edits));
	});

	test("the edit type leads the key, so a DOM dump stays readable", () => {
		expect(stagedEditKeys([quantity(CHAR_WAREHOUSE, 0, 5)])[0]).toStartWith(
			"quantity:",
		);
	});
});
