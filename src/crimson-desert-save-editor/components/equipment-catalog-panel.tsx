import { Box, Button, Drawer, Group, Select, Stack, Text } from "@mantine/core";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
	CatalogBrowser,
	type CatalogEntry,
} from "@/components/catalog-browser";
import {
	type EquipmentCatalog,
	EquipmentEditor,
	freshEquipmentDetails,
} from "@/components/equipment-workshop";
import { Picture } from "@/components/picture";
import { storageKeys } from "@/lib/add-plan";
import type { InsertEquipmentEdit } from "@/lib/equipment";
import type { SaveEdit } from "@/lib/staged-edits";

/** The equipment browser lists about a thousand rows, so they are windowed. */
const ROW_HEIGHT = 56;
const LIST_HEIGHT = 320;

/** Item 1000521 is suppressed by the game without its entitlement. */
const ENTITLEMENT_SUPPRESSED_KEY = "1000521";

/** Equipment the installed game refuses to hand out, whatever the save says. */
const unavailable = (catalog: EquipmentCatalog | null, key: string): boolean =>
	key === ENTITLEMENT_SUPPRESSED_KEY ||
	catalog?.items[key]?.blockedInGameData === true;

export const EquipmentCatalogPanel = ({
	catalog,
	itemCatalog,
	storages,
	defaultStorage,
	records,
	edits,
	busy,
	onStage,
}: {
	catalog: EquipmentCatalog | null;
	storages: { key: number; name: string }[];
	defaultStorage: number | null;
	records: { inventoryKey: number; itemKey: number }[];
	/** Every staged edit, so a row can say what the save would already hold. */
	edits: SaveEdit[];
	busy: boolean;
	onStage: (edit: InsertEquipmentEdit) => void;
	itemCatalog: {
		items: Record<
			string,
			{
				name: string;
				legacy_internal_name_hint?: string;
				description?: string;
			}
		>;
	} | null;
}) => {
	const [open, setOpen] = useState(false);
	const [storage, setStorage] = useState<number | null>(defaultStorage);
	const [selectedKey, setSelectedKey] = useState("");

	// The parent re-renders on every interaction, and the catalog does not
	// change, so the browse list and its membership sets are memoized.
	const entries = useMemo<CatalogEntry[]>(
		() =>
			Object.entries(catalog?.items ?? {})
				.filter(([, item]) => item.characterEquipment)
				.sort(([, left], [, right]) => left.name.localeCompare(right.name))
				.map(([key, item]) => ({
					key,
					name: item.name,
					category: item.category,
					description: `${item.category} · ${item.compatibleCharacters.join(
						", ",
					)}`,
					searchText: item.internalName,
				})),
		[catalog],
	);
	// Membership sets keep the per-row lookups O(1) instead of scanning the
	// inventory for every one of the thousand rows.
	const { held, staged } = useMemo(
		() => storageKeys({ records, edits, inventoryKey: storage }),
		[records, edits, storage],
	);

	const rowStatus = useCallback(
		(entry: CatalogEntry): string => {
			const key = Number(entry.key);
			if (staged.has(key)) return "Staged";
			if (held.has(key)) return "In storage";
			if (unavailable(catalog, entry.key)) return "Unavailable";
			return "";
		},
		[catalog, held, staged],
	);

	const selected = catalog?.items[selectedKey];
	const existing = selectedKey !== "" && held.has(Number(selectedKey));
	const wasStaged = selectedKey !== "" && staged.has(Number(selectedKey));

	return (
		<>
			<Button
				variant="default"
				size="sm"
				disabled={busy || !catalog}
				leftSection={<Plus size={16} />}
				onClick={() => {
					setStorage(defaultStorage ?? storages[0]?.key ?? null);
					setOpen(true);
				}}
			>
				Equipment
			</Button>
			<Drawer
				opened={open}
				onClose={() => setOpen(false)}
				position="right"
				size="36rem"
				title="Add equipment"
			>
				<Stack gap="lg">
					<Text size="sm" c="dimmed">
						Browse character equipment with confirmed refinement or socket
						support. Other items are available in Add Item.
					</Text>
					<Select
						value={storage === null ? null : String(storage)}
						data={storages.map((entry) => ({
							value: String(entry.key),
							label: entry.name,
						}))}
						allowDeselect={false}
						disabled={busy}
						aria-label="Equipment destination"
						onChange={(value) =>
							setStorage(value === null ? null : Number(value))
						}
					/>
					<CatalogBrowser
						entries={entries}
						labels={{
							all: "All equipment",
							category: "Equipment type",
							search: "Search equipment",
							list: "Matching equipment",
							empty: "No matching equipment.",
						}}
						rowHeight={ROW_HEIGHT}
						maxHeight={LIST_HEIGHT}
						getStatus={rowStatus}
						getActive={(entry) => entry.key === selectedKey}
						onSelect={(entry) => setSelectedKey(entry.key)}
					/>
					{selected && (
						<Box
							p="md"
							style={{
								border: "1px solid var(--mantine-primary-color-light)",
								background: "var(--mantine-primary-color-light)",
							}}
						>
							<Stack gap="sm">
								<Group gap="sm">
									<Picture kind="item" pictureKey={selectedKey} size={64} />
									<Text fw={500}>{selected.name}</Text>
								</Group>
								{unavailable(catalog, selectedKey) && (
									<Text size="sm" c="yellow">
										{selectedKey === ENTITLEMENT_SUPPRESSED_KEY
											? "The game suppresses this item without its entitlement. Adding a record cannot unlock it."
											: "The installed game marks this equipment as unavailable."}
									</Text>
								)}
								{existing && (
									<Text size="sm" c="dimmed">
										Already in this storage. Use its Edit button to change
										refinement or sockets.
									</Text>
								)}
								{wasStaged && (
									<Text size="sm" c="dimmed">
										Already staged. Use its Edit button in the inventory to
										change these settings.
									</Text>
								)}
								{storage !== null &&
									!existing &&
									!wasStaged &&
									!unavailable(catalog, selectedKey) && (
										<EquipmentEditor
											key={`${storage}:${selectedKey}`}
											adding
											submitLabel="Stage equipment addition"
											record={{
												inventoryKey: storage,
												itemKey: Number(selectedKey),
												slotNo: -1,
												equipment: freshEquipmentDetails(selected),
											}}
											name={selected.name}
											catalog={itemCatalog}
											busy={busy}
											onStage={(change) => {
												onStage({
													type: "insertEquipment",
													inventoryKey: storage,
													itemKey: Number(selectedKey),
													itemName: selected.name,
													refinement: change.refinement,
													unlockedSockets: change.unlockedSockets,
													socketItems: change.socketItems,
													equipment: {
														...freshEquipmentDetails(selected),
														refinement: change.refinement,
														unlockedSockets: change.unlockedSockets,
														socketItems: change.socketItems,
													},
												});
												setOpen(false);
											}}
										/>
									)}
							</Stack>
						</Box>
					)}
					<Text size="sm" c="dimmed">
						You can revise staged equipment in the inventory before downloading.
					</Text>
				</Stack>
			</Drawer>
		</>
	);
};
