import type { EquipmentDetails } from "@/lib/equipment";
import type { EquipmentCatalogFile } from "@/lib/save-engine/data";

/** The workshop reads the generated equipment catalog as the engine types it. */
export type EquipmentCatalog = EquipmentCatalogFile;

/** A gear slot reads as empty rather than absent: five of them, always. */
export const EMPTY_SOCKET = "empty";

export const socketList = (values: (number | null)[]) =>
	Array.from({ length: 5 }, (_, i) => values[i] ?? null);

/**
 * The equipment details a newly added item starts from: the catalog's own
 * ceilings, no refinement and nothing socketed.
 *
 * A staged addition has no save record to read, so its starting point has to be
 * the definition rather than a record — and it has to be *the definition's*
 * ceilings, or the first socket the editor offers would be one the item is not
 * allowed to open.
 */
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
