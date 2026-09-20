/**
 * Equipment as an item carries it, and the two staged edits that change it.
 *
 * These are the shapes the engine reports to the page and the shapes the page
 * stages back, so they are shared: the workshop renders them, the inventory
 * view stages them, and the session applies them. They live here rather than in
 * the workshop so the data shape does not depend on the component that draws
 * it.
 */

/** One item's refinement and socket state. */
export type EquipmentDetails = {
	refinement: number;
	canRefine: boolean;
	refinementLevels: number[];
	unlockedSockets: number;
	socketCap: number | null;
	socketItems: (number | null)[];
};

/** Change the refinement or sockets of a record already in the save. */
export type EquipmentEdit = {
	type: "equipment";
	inventoryKey: number;
	slotNo: number;
	itemKey: number;
	itemName: string;
	refinement: number;
	unlockedSockets: number;
	socketItems: (number | null)[];
};

/** Add a new equipment record, optionally with refinement or sockets set. */
export type InsertEquipmentEdit = {
	type: "insertEquipment";
	inventoryKey: number;
	itemKey: number;
	itemName: string;
	refinement: number;
	equipment: EquipmentDetails;
	unlockedSockets: number;
	socketItems: (number | null)[];
};
