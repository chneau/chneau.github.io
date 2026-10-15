import { describe, expect, test } from "bun:test";
import { nextGridIndex } from "../gridNavigation";

describe("nextGridIndex", () => {
	const TOTAL = 12;
	const COLUMNS = 4;

	test("ArrowRight moves along the row and wraps at the end", () => {
		expect(nextGridIndex(0, TOTAL, COLUMNS, "ArrowRight")).toBe(1);
		expect(nextGridIndex(3, TOTAL, COLUMNS, "ArrowRight")).toBe(4);
		expect(nextGridIndex(11, TOTAL, COLUMNS, "ArrowRight")).toBe(0);
	});

	test("ArrowLeft moves back along the row and wraps at the start", () => {
		expect(nextGridIndex(4, TOTAL, COLUMNS, "ArrowLeft")).toBe(3);
		expect(nextGridIndex(1, TOTAL, COLUMNS, "ArrowLeft")).toBe(0);
		expect(nextGridIndex(0, TOTAL, COLUMNS, "ArrowLeft")).toBe(11);
	});

	test("ArrowDown moves a whole row, not one card", () => {
		expect(nextGridIndex(0, TOTAL, COLUMNS, "ArrowDown")).toBe(4);
		expect(nextGridIndex(5, TOTAL, COLUMNS, "ArrowDown")).toBe(9);
	});

	test("ArrowUp moves a whole row, not one card", () => {
		expect(nextGridIndex(5, TOTAL, COLUMNS, "ArrowUp")).toBe(1);
		expect(nextGridIndex(9, TOTAL, COLUMNS, "ArrowUp")).toBe(5);
	});

	test("vertical movement clamps at the edges instead of wrapping", () => {
		expect(nextGridIndex(9, TOTAL, COLUMNS, "ArrowDown")).toBe(11);
		expect(nextGridIndex(11, TOTAL, COLUMNS, "ArrowDown")).toBe(11);
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
