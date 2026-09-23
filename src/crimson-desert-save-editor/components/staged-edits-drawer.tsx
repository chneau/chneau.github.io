import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Divider,
	Drawer,
	Flex,
	Group,
	ScrollArea,
	Stack,
	Text,
} from "@mantine/core";
import { CheckCircle2, Download, Trash2, X } from "lucide-react";
import { storageName } from "@/lib/inventory";
import type { SaveEdit } from "@/lib/staged-edits";

type StagedEditsDrawerProps = {
	opened: boolean;
	onClose: () => void;
	edits: SaveEdit[];
	nameOf: (itemKey: number) => string;
	onRemoveEdit: (index: number) => void;
	onDiscardAll: () => void;
	onDownload: () => void;
	busy: boolean;
};

const formatEditDetails = (
	edit: SaveEdit,
	nameOf: (key: number) => string,
): { title: string; description: string; tag: string; color: string } => {
	switch (edit.type) {
		case "quantity":
			return {
				title: edit.itemName || nameOf(edit.itemKey),
				description: `Set count to ${edit.newQuantity.toLocaleString()} in ${storageName(
					edit.inventoryKey,
				)}`,
				tag: "Quantity",
				color: "blue",
			};
		case "insertItem":
			return {
				title: edit.itemName || nameOf(edit.itemKey),
				description: `Add ${edit.quantity.toLocaleString()} items to ${storageName(
					edit.inventoryKey,
				)}`,
				tag: "New Stack",
				color: "teal",
			};
		case "insertCatalogItem":
			return {
				title: edit.itemName || nameOf(edit.itemKey),
				description: `Add 1 item to ${storageName(edit.inventoryKey)}`,
				tag: "Add Item",
				color: "cyan",
			};
		case "equipment":
			return {
				title: nameOf(edit.itemKey),
				description: `Refinement +${edit.refinement ?? 0}, ${
					edit.unlockedSockets ?? 0
				} sockets in ${storageName(edit.inventoryKey)}`,
				tag: "Equipment",
				color: "orange",
			};
		case "insertEquipment":
			return {
				title: nameOf(edit.itemKey),
				description: `Add equipment to ${storageName(edit.inventoryKey)}`,
				tag: "New Gear",
				color: "yellow",
			};
		case "addCompanion":
			return {
				title: `Companion #${edit.characterKey}`,
				description: "Unlock and add to roster",
				tag: "Companion",
				color: "grape",
			};
		case "addRoboWorkers":
			return {
				title: "Robo Workers",
				description: `Add ${edit.quantity} worker(s)`,
				tag: "Workers",
				color: "violet",
			};
		case "skills":
			return {
				title: "Knowledge & Skills",
				description: "Batch unlock and set tree progression",
				tag: "Skills",
				color: "indigo",
			};
		case "dye":
			return {
				title: edit.label || `Dye Scheme (${nameOf(edit.itemKey)})`,
				description: "Color channels updated on equipment",
				tag: "Dyes",
				color: "pink",
			};
		case "condition":
			return {
				title: `Condition (${nameOf(edit.itemKey)})`,
				description: `Durability & wear updated in ${storageName(
					edit.inventoryKey,
				)}`,
				tag: "Wear & Tear",
				color: "lime",
			};
		case "character":
		case "characterPreset":
			return {
				title: "Character Progression",
				description: "Player level / bond exp updated",
				tag: "Levels",
				color: "red",
			};
		case "quest":
		case "questPreset":
			return {
				title: "Quest Log",
				description: "Missions and stage completions updated",
				tag: "Quests",
				color: "green",
			};
		case "renameCompanion":
			return {
				title: `Rename (Character #${edit.characterKey})`,
				description: `Set name to "${edit.name}"`,
				tag: "Rename",
				color: "gray",
			};
		default:
			return {
				title: "Custom Change",
				description: "Staged save modification",
				tag: "Edit",
				color: "blue",
			};
	}
};

export const StagedEditsDrawer = ({
	opened,
	onClose,
	edits,
	nameOf,
	onRemoveEdit,
	onDiscardAll,
	onDownload,
	busy,
}: StagedEditsDrawerProps) => {
	return (
		<Drawer
			opened={opened}
			onClose={onClose}
			title={
				<Group gap="xs">
					<CheckCircle2 size={20} color="var(--mantine-color-blue-5)" />
					<Text fw={600} size="lg">
						Review Staged Changes ({edits.length})
					</Text>
				</Group>
			}
			position="right"
			size="md"
			padding="md"
		>
			<Flex direction="column" style={{ height: "calc(100vh - 80px)" }}>
				{edits.length === 0 ? (
					<Box
						style={{ flex: 1, display: "grid", placeItems: "center" }}
						p="xl"
					>
						<Text c="dimmed" size="sm" ta="center">
							No edits currently staged. Make changes across the inventory,
							skills, quests, or companion panels to queue them here.
						</Text>
					</Box>
				) : (
					<ScrollArea style={{ flex: 1 }} pr="xs">
						<Stack gap="xs">
							{edits.map((edit, idx) => {
								const info = formatEditDetails(edit, nameOf);
								const key = `${edit.type}-${idx}`;
								return (
									<Box
										key={key}
										p="sm"
										style={{
											borderRadius: 8,
											border: "1px solid var(--mantine-color-dark-4)",
											background: "var(--mantine-color-dark-6)",
										}}
									>
										<Group justify="space-between" wrap="nowrap" align="start">
											<Box style={{ minWidth: 0, flex: 1 }}>
												<Group gap="xs" mb={4}>
													<Badge size="xs" color={info.color} variant="filled">
														{info.tag}
													</Badge>
													<Text size="sm" fw={600} truncate>
														{info.title}
													</Text>
												</Group>
												<Text size="xs" c="dimmed">
													{info.description}
												</Text>
											</Box>
											<ActionIcon
												variant="subtle"
												color="red"
												size="sm"
												onClick={() => onRemoveEdit(idx)}
												title="Remove this change"
												aria-label="Remove change"
											>
												<X size={14} />
											</ActionIcon>
										</Group>
									</Box>
								);
							})}
						</Stack>
					</ScrollArea>
				)}

				<Divider my="md" />

				<Group justify="space-between" gap="sm">
					<Button
						variant="subtle"
						color="red"
						size="xs"
						leftSection={<Trash2 size={14} />}
						disabled={edits.length === 0 || busy}
						onClick={() => {
							onDiscardAll();
							onClose();
						}}
					>
						Discard all
					</Button>
					<Button
						size="sm"
						leftSection={<Download size={16} />}
						disabled={edits.length === 0 || busy}
						onClick={() => {
							onClose();
							onDownload();
						}}
					>
						Download edited save
					</Button>
				</Group>
			</Flex>
		</Drawer>
	);
};
