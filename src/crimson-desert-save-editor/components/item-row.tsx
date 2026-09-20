import { Badge, Box, Button, Group, Table, Text } from "@mantine/core";
import { PencilLine } from "lucide-react";
import { memo } from "react";
import { Picture } from "@/components/picture";
import type { GroupedItem } from "@/lib/inventory";

type ItemRowProps = {
	item: GroupedItem;
	selected: boolean;
	busy: boolean;
	onSelect: (item: GroupedItem) => void;
	onEdit: (item: GroupedItem) => void;
};

/**
 * One row of the storage table. It is memoized because a storage holds every
 * item the player owns: without this, selecting one item re-renders all of the
 * rows in the storage on every click.
 */
export const ItemRow = memo(
	({ item, selected, busy, onSelect, onEdit }: ItemRowProps) => (
		<Table.Tr
			bg={selected ? "var(--mantine-primary-color-light)" : undefined}
			style={{ cursor: "pointer" }}
			onClick={() => onSelect(item)}
		>
			<Table.Td>
				<Group gap="md" wrap="nowrap">
					<Picture kind="item" pictureKey={item.itemKey} />
					<Box style={{ minWidth: 0 }}>
						<Text size="sm" fw={500} truncate>
							{item.name}
						</Text>
						<Group gap="sm" mt={2}>
							<Text size="xs" c="dimmed">
								Item {item.itemKey}
							</Text>
							{item.recordList[0]?.equipment && (
								<Text size="xs" c="dimmed">
									Refinement {item.recordList[0].equipment.refinement}
								</Text>
							)}
							{item.recordList.some((record) => record.equipmentChanged) && (
								<Text size="xs" c="brand">
									Staged edit
								</Text>
							)}
							{item.staged && (
								<Text
									size="10px"
									fw={500}
									c="brand"
									tt="uppercase"
									style={{ letterSpacing: "0.1em" }}
								>
									Staged addition
								</Text>
							)}
						</Group>
					</Box>
				</Group>
			</Table.Td>
			<Table.Td visibleFrom="md">
				<Text size="xs" c="dimmed">
					{item.category}
				</Text>
			</Table.Td>
			<Table.Td ta="right">
				<Text
					size="sm"
					ff="monospace"
					style={{ fontVariantNumeric: "tabular-nums" }}
				>
					{item.quantity.toLocaleString()}
				</Text>
			</Table.Td>
			<Table.Td ta="right">
				{item.staged && !item.recordList[0]?.equipment ? (
					<Badge variant="outline" color="brand" size="sm">
						Staged
					</Badge>
				) : (
					<Button
						type="button"
						variant="default"
						size="compact-xs"
						disabled={busy || item.recordList[0]?.noGearToEdit}
						onClick={(event) => {
							event.stopPropagation();
							onEdit(item);
						}}
					>
						<PencilLine size={14} />
						Edit
					</Button>
				)}
			</Table.Td>
		</Table.Tr>
	),
);
