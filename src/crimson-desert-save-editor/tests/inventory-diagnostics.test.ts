/**
 * The inventory reader's diagnostics.
 *
 * A record missing an identity field cannot be edited safely, so the reader
 * withholds it. `readInventoryWithDiagnostics` names what was withheld instead
 * of dropping it silently; these tests pin that the two views of the same
 * payload agree and that a healthy save withholds nothing.
 *
 * Run with `bun test` (or `bun run check:test`, the same command with the
 * repository's parallel and timeout settings).
 */

import { describe, expect, test } from "bun:test";
import {
	type InventoryReadResult,
	readInventory,
	readInventoryWithDiagnostics,
	type SkippedInventoryRecord,
} from "../lib/save-engine/inventory-reader";
import { fixture, opened } from "./fixtures";

const identityFields = ["_itemNo", "_itemKey", "_slotNo", "_stackCount"];

describe("readInventoryWithDiagnostics", () => {
	test("reports no skipped records for a healthy save", async () => {
		const decoded = await opened(fixture("save.save"));
		const result: InventoryReadResult = readInventoryWithDiagnostics(
			decoded.rawPayload,
		);
		const skipped: SkippedInventoryRecord[] = result.skipped;
		expect(skipped).toEqual([]);
		expect(result.records.length).toBeGreaterThan(0);
	});

	test("every identified record carries all four identity fields", async () => {
		const decoded = await opened(fixture("save.save"));
		for (const record of readInventory(decoded.rawPayload)) {
			for (const field of identityFields) {
				expect(field in record.values, `${field} present`).toBe(true);
			}
			expect(Number.isFinite(record.itemKey)).toBe(true);
			expect(Number.isFinite(record.slotNo)).toBe(true);
		}
	});

	test("the plain reader and the diagnostic reader agree", async () => {
		const decoded = await opened(fixture("save.save"));
		const plain = readInventory(decoded.rawPayload);
		const diagnostic = readInventoryWithDiagnostics(decoded.rawPayload);
		expect(diagnostic.records.length).toBe(plain.length);
	});
});
