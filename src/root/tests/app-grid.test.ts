import { describe, expect, test } from "bun:test";
import { nextGridIndex } from "../AppGrid";

/**
 * Arrow-key roving focus over the dashboard card grid.
 *
 * The handler used to treat `ArrowDown` as `ArrowRight` and `ArrowUp` as
 * `ArrowLeft`, so the vertical arrows walked the grid as one long row. On a
 * multi-column layout that means ArrowDown jumped sideways, and there was no way
 * to move down a row at all.
 *
 * `.app-grid` is `repeat(auto-fill, minmax(280px, 1fr))`, so the column count is
 * a function of the viewport rather than of the item count — which is why the
 * component measures the row off `offsetTop` and this test drives the arithmetic
 * with the column count handed in. happy-dom reports every `offsetTop` as 0, so
 * the measurement itself is not observable here and is not asserted.
 */

describe("nextGridIndex", () => {
	/** A 4x3 grid: four columns, three rows, indices 0..11 laid out in reading order. */
	const TOTAL = 12;
	const COLUMNS = 4;

	test("ArrowRight moves along the row and wraps at the end", () => {
		expect(nextGridIndex(0, TOTAL, COLUMNS, "ArrowRight")).toBe(1);
		expect(nextGridIndex(3, TOTAL, COLUMNS, "ArrowRight")).toBe(4);
		// Past the last card, wrap to the first.
		expect(nextGridIndex(11, TOTAL, COLUMNS, "ArrowRight")).toBe(0);
	});

	test("ArrowLeft moves back along the row and wraps at the start", () => {
		expect(nextGridIndex(4, TOTAL, COLUMNS, "ArrowLeft")).toBe(3);
		expect(nextGridIndex(1, TOTAL, COLUMNS, "ArrowLeft")).toBe(0);
		expect(nextGridIndex(0, TOTAL, COLUMNS, "ArrowLeft")).toBe(11);
	});

	test("ArrowDown moves a whole row, not one card", () => {
		// This is the defect: it used to return index + 1, i.e. sideways.
		expect(nextGridIndex(0, TOTAL, COLUMNS, "ArrowDown")).toBe(4);
		expect(nextGridIndex(5, TOTAL, COLUMNS, "ArrowDown")).toBe(9);
	});

	test("ArrowUp moves a whole row, not one card", () => {
		expect(nextGridIndex(5, TOTAL, COLUMNS, "ArrowUp")).toBe(1);
		expect(nextGridIndex(9, TOTAL, COLUMNS, "ArrowUp")).toBe(5);
	});

	test("vertical movement clamps at the edges instead of wrapping", () => {
		// Down on the last row stays put rather than jumping back to the top.
		expect(nextGridIndex(9, TOTAL, COLUMNS, "ArrowDown")).toBe(11);
		expect(nextGridIndex(11, TOTAL, COLUMNS, "ArrowDown")).toBe(11);
		// Up on the first row likewise.
		expect(nextGridIndex(2, TOTAL, COLUMNS, "ArrowUp")).toBe(0);
		expect(nextGridIndex(0, TOTAL, COLUMNS, "ArrowUp")).toBe(0);
	});

	test("Home and End reach the first and last card", () => {
		for (const index of [0, 5, 11]) {
			expect(nextGridIndex(index, TOTAL, COLUMNS, "Home")).toBe(0);
			expect(nextGridIndex(index, TOTAL, COLUMNS, "End")).toBe(11);
		}
	});

	test("keys this does not handle return null so the event is left alone", () => {
		for (const key of ["Enter", " ", "Escape", "a", "Tab"]) {
			expect(nextGridIndex(0, TOTAL, COLUMNS, key)).toBeNull();
		}
	});

	test("an empty grid handles nothing", () => {
		expect(nextGridIndex(0, 0, COLUMNS, "ArrowRight")).toBeNull();
	});

	test("a single-column grid moves by one in every direction", () => {
		expect(nextGridIndex(2, 6, 1, "ArrowDown")).toBe(3);
		expect(nextGridIndex(2, 6, 1, "ArrowUp")).toBe(1);
	});

	test("a zero or unmeasured column count degrades to one, never to zero", () => {
		// happy-dom reports `offsetTop` as 0 for every element, so a grid measured
		// outside a browser can report one column or none. Clamping keeps focus
		// moving instead of trapping it.
		expect(nextGridIndex(0, 6, 0, "ArrowDown")).toBe(1);
		expect(nextGridIndex(0, 6, -3, "ArrowDown")).toBe(1);
	});

	test("every arrow key lands on a real card", () => {
		const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
		for (let index = 0; index < TOTAL; index += 1) {
			for (const key of keys) {
				const next = nextGridIndex(index, TOTAL, COLUMNS, key);
				expect(next).not.toBeNull();
				expect(next as number).toBeGreaterThanOrEqual(0);
				expect(next as number).toBeLessThan(TOTAL);
			}
		}
	});
});
