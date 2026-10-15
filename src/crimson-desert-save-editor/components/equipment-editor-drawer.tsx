import {
	Alert,
	Badge,
	Box,
	Drawer,
	Group,
	Select,
	Stack,
	Text,
} from "@mantine/core";
import { TriangleAlert } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { EquipmentEdit, InsertEquipmentEdit } from "../lib/equipment";
import abyssGearRules from "../lib/generated/abyss-gear-compatibility.json";
import {
	type Catalog,
	type GroupedItem,
	type InventoryRecord,
	storageName,
} from "../lib/inventory";
import type { QuantityEdit, SaveEdit } from "../lib/staged-edits";
import {
	type EquipmentCatalog,
	freshEquipmentDetails,
} from "./equipment-details";
import { QuantityEditor } from "./equipment-quantity-editor";
import { EquipmentEditor } from "./equipment-workshop";
import { Picture } from "./picture";

const DrawerHeading = ({
	item,
	record,
	activeStorage,
}: {
	item: GroupedItem;
	record: InventoryRecord;
	activeStorage: number | null;
}) => (
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
			{activeStorage === null ? "Unknown storage" : storageName(activeStorage)}{" "}
			· {record.staged ? "staged addition" : `save slot ${record.slotNo}`}
		</Text>
	</Stack>
);

const StagedAdditionEditor = ({
	addition,
	additionDefinition,
	itemName,
	catalog,
	busy,
	staged,
	onStage,
	onRemove,
}: {
	addition: InsertEquipmentEdit;
	additionDefinition: EquipmentCatalog["items"][string];
	itemName: string;
	catalog: Catalog | null;
	busy: boolean;
	staged: EquipmentEdit;
	onStage: (edit: EquipmentEdit) => void;
	onRemove: () => void;
}) => (
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
		name={itemName}
		catalog={catalog}
		busy={busy}
		staged={staged}
		onStage={onStage}
		onRemove={onRemove}
	/>
);

const RecordChooser = ({
	item,
	record,
	onChoose,
}: {
	item: GroupedItem;
	record: InventoryRecord;
	onChoose: (record: InventoryRecord) => void;
}) => (
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
				if (candidate) onChoose(candidate);
			}}
		/>
	</Box>
);

const SavedEquipmentEditor = ({
	savedRecord,
	itemName,
	catalog,
	staged,
	busy,
	onStage,
	setEdits,
}: {
	savedRecord: InventoryRecord & {
		equipment: NonNullable<InventoryRecord["equipment"]>;
	};
	itemName: string;
	catalog: Catalog | null;
	staged: EquipmentEdit | undefined;
	busy: boolean;
	onStage: (edit: EquipmentEdit | InsertEquipmentEdit) => void;
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
}) => (
	<EquipmentEditor
		key={`${savedRecord.inventoryKey}:${savedRecord.slotNo}:${
			staged ? JSON.stringify(staged) : "original"
		}`}
		record={{ ...savedRecord, equipment: savedRecord.equipment }}
		name={itemName}
		catalog={catalog}
		staged={staged}
		busy={busy}
		onStage={onStage}
		rules={abyssGearRules}
		savedRecord={savedRecord}
		onRemove={() =>
			setEdits((current) => current.filter((entry) => entry !== staged))
		}
	/>
);

export const EquipmentEditorDrawer = ({
	open,
	onClose,
	item,
	record,
	activeStorage,
	catalog,
	busy,
	error,
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
	error: string;
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
				<DrawerHeading
					item={item}
					record={record}
					activeStorage={activeStorage}
				/>
			) : null
		}
	>
		{item && record ? (
			<Stack gap="lg">
				{error && (
					<Alert
						color="red"
						icon={<TriangleAlert size={16} />}
						title="Could not apply change"
					>
						{error}
					</Alert>
				)}
				{item.recordList.length > 1 && (
					<RecordChooser
						item={item}
						record={record}
						onChoose={onChooseRecord}
					/>
				)}

				{addition && additionDefinition ? (
					<StagedAdditionEditor
						addition={addition}
						additionDefinition={additionDefinition}
						itemName={item.name}
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
					<SavedEquipmentEditor
						savedRecord={{
							...savedRecord,
							equipment: savedRecord.equipment,
						}}
						itemName={item.name}
						catalog={catalog}
						staged={stagedEquipment}
						busy={busy}
						onStage={onStageEquipment}
						setEdits={setEdits}
					/>
				) : (
					<QuantityEditor
						record={record}
						staged={stagedEdit}
						displayedQuantity={displayedQuantity}
						onQuantityChange={onQuantityChange}
						onStage={onStageQuantity}
					/>
				)}
			</Stack>
		) : null}
	</Drawer>
);
