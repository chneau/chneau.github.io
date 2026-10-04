import {
	ActionIcon,
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
import { useMemo } from "react";
import { storageName } from "@/lib/inventory";
import { stagedEditKeys } from "@/lib/staged-edit-keys";
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
): { title: string; description: string; tag: string } => {
	switch (edit.type) {
		case "quantity":
			return {
				title: edit.itemName || nameOf(edit.itemKey),
				description: `Set count to ${edit.newQuantity.toLocaleString()} in ${storageName(
					edit.inventoryKey,
				)}`,
				tag: "Quantity",
			};
		case "insertItem":
			return {
				title: edit.itemName || nameOf(edit.itemKey),
				description: `Add ${edit.quantity.toLocaleString()} items to ${storageName(
					edit.inventoryKey,
				)}`,
				tag: "New stack",
			};
		case "insertCatalogItem":
			return {
				title: edit.itemName || nameOf(edit.itemKey),
				description: `Add 1 item to ${storageName(edit.inventoryKey)}`,
				tag: "Add item",
			};
		case "equipment":
			return {
				title: nameOf(edit.itemKey),
				description: `Refinement +${edit.refinement ?? 0}, ${
					edit.unlockedSockets ?? 0
				} sockets in ${storageName(edit.inventoryKey)}`,
				tag: "Equipment",
			};
		case "insertEquipment":
			return {
				title: nameOf(edit.itemKey),
				description: `Add equipment to ${storageName(edit.inventoryKey)}`,
				tag: "New gear",
			};
		case "addCompanion":
			return {
				title: `Companion #${edit.characterKey}`,
				description: "Unlock and add to roster",
				tag: "Companion",
			};
		case "addRoboWorkers":
			return {
				title: "Robo Workers",
				description: `Add ${edit.quantity} worker(s)`,
				tag: "Workers",
			};
		case "skills":
			return {
				title: "Knowledge & Skills",
				description: "Batch unlock and set tree progression",
				tag: "Skills",
			};
		case "dye":
			return {
				title: edit.label || `Dye Scheme (${nameOf(edit.itemKey)})`,
				description: "Color channels updated on equipment",
				tag: "Dyes",
			};
		case "condition":
			return {
				title: `Condition (${nameOf(edit.itemKey)})`,
				description: `Durability & wear updated in ${storageName(
					edit.inventoryKey,
				)}`,
				tag: "Wear & tear",
			};
		case "character":
		case "characterPreset":
			return {
				title: "Character Progression",
				description: "Player level / bond exp updated",
				tag: "Levels",
			};
		case "quest":
		case "questPreset":
			return {
				title: "Quest Log",
				description: "Missions and stage completions updated",
				tag: "Quests",
			};
		case "renameCompanion":
			return {
				title: `Rename (Character #${edit.characterKey})`,
				description: `Set name to "${edit.name}"`,
				tag: "Rename",
			};
		default:
			return {
				title: "Custom Change",
				description: "Staged save modification",
				tag: "Edit",
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
	// Stable across a removal, so React does not hand one row's DOM to a
	// different edit when an earlier row is deleted. See `stagedEditKeys`.
	const keys = useMemo(() => stagedEditKeys(edits), [edits]);

	return (
		<Drawer
			opened={opened}
			onClose={onClose}
			title={
				<Group gap="xs">
					<CheckCircle2
						size={20}
						color="var(--mantine-primary-color-filled)"
						strokeWidth={2}
					/>
					<Text fw={600} size="lg">
						Review Staged Changes ({edits.length})
					</Text>
				</Group>
			}
			position="right"
			size="md"
			padding="md"
		>
			<Flex direction="column" style={{ height: "calc(100dvh - 80px)" }}>
				{edits.length === 0 ? (
					<Box
						style={{ flex: 1, display: "grid", placeItems: "center" }}
						p="xl"
					>
						<Text c="dimmed" size="sm" ta="center">
							No edits currently staged. Make changes across the inventory,
							skills, quests, or companion panels to stage them here.
						</Text>
					</Box>
				) : (
					<ScrollArea style={{ flex: 1 }} pr="xs">
						<Stack gap="xs">
							{edits.map((edit, idx) => {
								const info = formatEditDetails(edit, nameOf);
								return (
									<Box
										key={keys[idx]}
										p="sm"
										style={{
											borderRadius: 8,
											border: "1px solid var(--app-border)",
											background: "var(--app-surface-3)",
										}}
									>
										<Group justify="space-between" wrap="nowrap" align="start">
											<Box style={{ minWidth: 0, flex: 1 }}>
												<Group gap="sm" mb={4} wrap="nowrap">
													<Text
														size="10px"
														ff="monospace"
														c="dimmed"
														tt="uppercase"
														fw={600}
														style={{ letterSpacing: "0.14em", flexShrink: 0 }}
													>
														{info.tag}
													</Text>
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
						Download save
					</Button>
				</Group>
			</Flex>
		</Drawer>
	);
};
