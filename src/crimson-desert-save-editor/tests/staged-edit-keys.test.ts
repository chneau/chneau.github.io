import { describe, expect, test } from "bun:test";
import { stagedEditKeys } from "../lib/staged-edit-keys";
import type { SaveEdit } from "../lib/staged-edits";

/**
 * Keys for the staged-edits drawer rows.
 *
 * The rows used to be keyed `` `${edit.type}-${idx}` `` — an index key on a list
 * with a remove button on every row, so deleting one edit re-keyed every later
 * row and React handed one row's DOM to a different edit. This pins the property
 * that makes the key safe: removing an edit must not change the key of any edit
 * that survives it.
 *
 * Identity comes from the edit's own content because `SaveEdit` is a
 * twelve-member discriminated union with no id, and the two edits most likely to
 * collide are the ones a test should be most careful about.
 */

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
		// Two identical edits are allowed to be staged — the engine refuses the
		// duplicate on apply rather than preventing it — so they must not collide
		// into one React node.
		const keys = stagedEditKeys([
			quantity(CHAR_WAREHOUSE, 0, 5),
			quantity(CHAR_WAREHOUSE, 0, 5),
		]);
		expect(new Set(keys).size).toBe(2);
	});

	/**
	 * The property the index key broke: remove an edit, and every edit after it
	 * shifts down one position. If the key moves with the position, React
	 * re-keys the survivors and hands their DOM to different rows.
	 */
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

			// Compare against the survivors' original keys, in order.
			const expected = before.filter((_, index) => index !== removed);
			expect(after).toEqual(expected);
		}
	});

	test("identical edits are re-keyed among themselves, and that is the limit", () => {
		// Three edits with identical content are indistinguishable by content, so
		// the occurrence counter renumbers the survivors when one is removed:
		// `[base, base#1, base#2]` becomes `[base, base#1]`.
		//
		// This is asserted rather than hidden because it is the honest boundary of
		// a content-derived key. Making it stable needs an explicit id on
		// `SaveEdit`, which is a change to the edit model and to every producer
		// of one — not a change to a drawer. The consequence is bounded: the rows
		// that get re-keyed here are the ones already showing identical text, and
		// they hold no per-row state (each is a description plus a remove button).
		const edits: SaveEdit[] = [
			quantity(CHAR_WAREHOUSE, 0, 5),
			quantity(CHAR_WAREHOUSE, 0, 5),
			quantity(CHAR_WAREHOUSE, 0, 5),
		];
		const before = stagedEditKeys(edits);
		expect(new Set(before).size).toBe(3);

		const survivors = edits.filter((_, index) => index !== 1);
		const after = stagedEditKeys(survivors);

		// Unique still holds, and the leading key still belongs to the first.
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
