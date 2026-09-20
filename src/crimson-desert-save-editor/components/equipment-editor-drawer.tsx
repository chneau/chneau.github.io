import {
	Alert,
	Badge,
	Box,
	Button,
	Drawer,
	Group,
	Select,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import type { Dispatch, SetStateAction } from "react";
import {
	type EquipmentCatalog,
	EquipmentEditor,
	freshEquipmentDetails,
} from "@/components/equipment-workshop";
import { Picture } from "@/components/picture";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import abyssGearRules from "@/lib/generated/abyss-gear-compatibility.json";
import {
	type Catalog,
	type GroupedItem,
	type InventoryRecord,
	storageName,
} from "@/lib/inventory";
import type { QuantityEdit, SaveEdit } from "@/lib/staged-edits";

/**
 * The editor for whatever the inventory view has selected: refinement and
 * sockets for equipment, a quantity for a plain stack, and the same workshop
 * for a staged addition that has no save record yet.
 *
 * Which of those applies is decided by what the record is, so the branch lives
 * here rather than being spread over the details pane.
 */
export const EquipmentEditorDrawer = ({
	open,
	onClose,
	item,
	record,
	activeStorage,
	catalog,
	busy,
	savedRecord,
	stagedEquipment,
	addition,
	additionDefinition,
	stagedEdit,
	displayedQuantity,
	onQuantityChange,
	onChooseRecord,
	onStageQuantity,
	onStageEquipment,
	setEdits,
}: {
	open: boolean;
	onClose: () => void;
	item: GroupedItem | null;
	record: InventoryRecord | null;
	activeStorage: number | null;
	catalog: Catalog | null;
	busy: boolean;
	/** The save's own record, so the editor edits what is in the file. */
	savedRecord: InventoryRecord | undefined;
	stagedEquipment: EquipmentEdit | undefined;
	addition: InsertEquipmentEdit | undefined;
	additionDefinition: EquipmentCatalog["items"][string] | undefined;
	stagedEdit: QuantityEdit | undefined;
	displayedQuantity: string;
	onQuantityChange: (value: string) => void;
	onChooseRecord: (record: InventoryRecord) => void;
	onStageQuantity: () => void;
	onStageEquipment: (edit: EquipmentEdit | InsertEquipmentEdit) => void;
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
}) => (
	<Drawer
		opened={open}
		onClose={onClose}
		position="right"
		size="28rem"
		title={
			item && record ? (
				<Stack gap="xs">
					<Group gap="sm">
						<Badge
							variant="outline"
							color="brand"
							styles={{ label: { textTransform: "uppercase" } }}
						>
							{item.category}
						</Badge>
						<Text size="xs" c="dimmed" ff="monospace">
							#{item.itemKey}
						</Text>
					</Group>
					<Group gap="md" wrap="nowrap">
						<Picture kind="item" pictureKey={item.itemKey} size={64} />
						<Text component="span" size="xl" fw={600}>
							Edit {item.name}
						</Text>
					</Group>
					<Text size="xs" c="dimmed">
						{activeStorage === null
							? "Unknown storage"
							: storageName(activeStorage)}{" "}
						· {record.staged ? "staged addition" : `save slot ${record.slotNo}`}
					</Text>
				</Stack>
			) : null
		}
	>
		{item && record ? (
			<Stack gap="lg">
				{item.recordList.length > 1 && (
					<Box>
						<Select
							label="Save record"
							description="This item has more than one copy here. Choose the exact copy to edit."
							value={String(record.slotNo)}
							allowDeselect={false}
							data={item.recordList.map((candidate) => ({
								value: String(candidate.slotNo),
								label: `Slot ${candidate.slotNo} · ${
									candidate.equipment
										? `refinement ${candidate.equipment.refinement}`
										: `quantity ${candidate.quantity}`
								}`,
							}))}
							onChange={(value) => {
								const candidate = item.recordList.find(
									(entry) => entry.slotNo === Number(value),
								);
								if (candidate) onChooseRecord(candidate);
							}}
						/>
					</Box>
				)}

				{addition && additionDefinition ? (
					<EquipmentEditor
						key={`addition:${addition.inventoryKey}:${addition.itemKey}:${JSON.stringify(
							addition,
						)}`}
						adding
						submitLabel="Update staged equipment"
						record={{
							inventoryKey: addition.inventoryKey,
							itemKey: addition.itemKey,
							slotNo: -1,
							equipment: freshEquipmentDetails(additionDefinition),
						}}
						name={item.name}
						catalog={catalog}
						busy={busy}
						staged={{
							type: "equipment",
							inventoryKey: addition.inventoryKey,
							itemKey: addition.itemKey,
							slotNo: -1,
							itemName: addition.itemName,
							refinement: addition.refinement,
							unlockedSockets: addition.unlockedSockets,
							socketItems: addition.socketItems,
						}}
						onStage={(change) =>
							onStageEquipment({
								...addition,
								refinement: change.refinement,
								unlockedSockets: change.unlockedSockets,
								socketItems: change.socketItems,
								equipment: {
									...addition.equipment,
									refinement: change.refinement,
									unlockedSockets: change.unlockedSockets,
									socketItems: change.socketItems,
								},
							})
						}
						onRemove={() => {
							setEdits((current) =>
								current.filter((entry) => entry !== addition),
							);
							onClose();
						}}
					/>
				) : savedRecord?.equipment ? (
					<EquipmentEditor
						key={`${savedRecord.inventoryKey}:${savedRecord.slotNo}:${
							stagedEquipment ? JSON.stringify(stagedEquipment) : "original"
						}`}
						record={{ ...savedRecord, equipment: savedRecord.equipment }}
						name={item.name}
						catalog={catalog}
						staged={stagedEquipment}
						busy={busy}
						onStage={onStageEquipment}
						rules={abyssGearRules}
						savedRecord={savedRecord}
						onRemove={() =>
							setEdits((current) =>
								current.filter((entry) => entry !== stagedEquipment),
							)
						}
					/>
				) : (
					<>
						<TextInput
							label="Quantity"
							aria-label="New quantity"
							inputMode="numeric"
							value={displayedQuantity}
							onChange={(event) => onQuantityChange(event.currentTarget.value)}
							description={`Quantity in the uploaded save: ${(
								record.originalQuantity ?? record.quantity
							).toLocaleString()}.`}
							ff="monospace"
						/>
						<Button onClick={onStageQuantity}>Stage quantity change</Button>
						{stagedEdit ? (
							<Alert variant="light" color="brand" p="sm">
								<Text size="xs">
									Staged: {stagedEdit.expectedQuantity.toLocaleString()} →{" "}
									{stagedEdit.newQuantity.toLocaleString()}. Use{" "}
									<Text span fw={500}>
										Download edited
									</Text>{" "}
									at the top to create the new save.
								</Text>
							</Alert>
						) : (
							<Text size="xs" c="dimmed">
								Staging does not touch your original file. The new save is only
								created when you choose Download edited.
							</Text>
						)}
					</>
				)}
			</Stack>
		) : null}
	</Drawer>
);
