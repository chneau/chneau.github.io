export type EquipmentDetails = {
	refinement: number;
	canRefine: boolean;
	refinementLevels: number[];
	unlockedSockets: number;
	socketCap: number | null;
	socketItems: (number | null)[];
};

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
