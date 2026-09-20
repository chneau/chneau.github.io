/**
 * TypeScript port of `public/python/editor/inventory_editor.py`.
 */

import { readU64, writeU64 } from "./bytes";
import {
	findInventoryRecord,
	type InventoryRecordTarget,
	readInventory,
} from "./inventory-reader";
import { assertOnlyChanged } from "./raw-diff";
import { transactSave } from "./transaction";

/** The record a quantity edit addresses; the same shape, named for callers. */
export type InventoryTarget = InventoryRecordTarget;

export const editInventoryQuantities = async (
	sourceBytes: Uint8Array,
	changes: Array<[InventoryTarget, number, number]>,
): Promise<[Uint8Array, Array<Record<string, unknown>>]> => {
	if (changes.length === 0) {
		throw new Error("Quantity batch must contain at least one change");
	}

	const { bytes, reopenedPayload, verification, value } = await transactSave(
		sourceBytes,
		"Encoded quantity edit",
		({ original }) => {
			const beforeRecords = readInventory(original);
			const editedRaw = original.slice();
			/** One range per touched stack-count field, for the final assertion. */
			const touched: Array<{ start: number; size: number }> = [];
			const finalQuantities = new Map<string, number>();
			const audits: Array<Record<string, unknown>> = [];

			for (const [target, expectedQuantity, newQuantity] of changes) {
				if (
					!Number.isInteger(newQuantity) ||
					newQuantity < 1 ||
					newQuantity > 999_999_999
				) {
					throw new Error("Quantity must be between 1 and 999,999,999");
				}
				const before = findInventoryRecord(beforeRecords, target);
				const stackOffset = before.fieldOffsets._stackCount;
				if (stackOffset === undefined) {
					throw new Error("Target record has no serialized stack-count field");
				}
				const current = Number(readU64(editedRaw, stackOffset));
				if (current !== expectedQuantity) {
					throw new Error(
						`Expected current quantity ${expectedQuantity}, found ${current}`,
					);
				}
				if (current === newQuantity) {
					throw new Error("Requested quantity is already present");
				}
				const oldField = editedRaw.slice(stackOffset, stackOffset + 8);
				writeU64(editedRaw, stackOffset, BigInt(newQuantity));
				touched.push({ start: stackOffset, size: 8 });
				finalQuantities.set(
					`${target.inventoryKey}:${target.slotNo}:${target.itemKey}`,
					newQuantity,
				);
				const changedOffsets: number[] = [];
				for (let index = 0; index < 8; index++) {
					if (oldField[index] !== editedRaw[stackOffset + index]) {
						changedOffsets.push(stackOffset + index);
					}
				}
				audits.push({
					edit: "inventory_quantity",
					inventory_key: target.inventoryKey,
					slot: target.slotNo,
					item_key: target.itemKey,
					old_quantity: expectedQuantity,
					new_quantity: newQuantity,
					stack_offset: stackOffset,
					raw_changed_byte_offsets: changedOffsets,
				});
			}

			assertOnlyChanged(original, editedRaw, touched, "Quantity edit");
			return {
				payload: editedRaw,
				value: { beforeRecords, audits, finalQuantities },
			};
		},
	);

	const afterRecords = readInventory(reopenedPayload);
	for (const [target, quantity] of value.finalQuantities) {
		const [inventoryKey, slotNo, itemKey] = target
			.split(":")
			.map((entry) => Number(entry)) as [number, number, number];
		const record = findInventoryRecord(afterRecords, {
			inventoryKey,
			slotNo,
			itemKey,
		});
		if (record.stackCount !== quantity) {
			throw new Error(
				"Edited output did not reparse with the requested quantity",
			);
		}
	}
	if (afterRecords.length !== value.beforeRecords.length) {
		throw new Error("Inventory record count changed during quantity edit");
	}

	const validation = {
		inventory_record_count: afterRecords.length,
		...verification,
		inventory_reparsed: true,
	};
	return [bytes, value.audits.map((audit) => ({ ...audit, ...validation }))];
};
