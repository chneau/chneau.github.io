import type { EquipmentDetails } from "../lib/equipment";
import type { EquipmentCatalogFile } from "../lib/save-engine/data";

export type EquipmentCatalog = EquipmentCatalogFile;

export const EMPTY_SOCKET = "empty";

export const socketList = (values: (number | null)[]) =>
	Array.from({ length: 5 }, (_, i) => values[i] ?? null);

export const freshEquipmentDetails = (
	item: EquipmentCatalog["items"][string],
): EquipmentDetails => {
	return {
		refinement: 0,
		canRefine: item.canRefine,
		refinementLevels: item.refinementLevels,
		unlockedSockets: item.initialUnlockedSockets,
		socketCap: item.socketCap,
		socketItems: socketList([]),
	};
};
