import {
	Alert,
	Badge,
	Box,
	Button,
	ColorInput,
	Group,
	NumberInput,
	Paper,
	ScrollArea,
	Select,
	Stack,
	Table,
	Text,
} from "@mantine/core";
import { Paintbrush, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { DyeDescription, DyedItem, DyeSlot } from "@/lib/save-engine/dyes";
import type { DyeEdit } from "@/lib/staged-edits";

type PanelProps = {
	description?: DyeDescription;
	edits: DyeEdit[];
	busy: boolean;
	error: string;
	onStage: (edits: DyeEdit[]) => void;
};

type Channels = {
	red: number | null;
	green: number | null;
	blue: number | null;
	alpha: number | null;
	grime: number | null;
	colorGroup: number | null;
	material: number | null;
};

const EMPTY: Channels = {
	red: null,
	green: null,
	blue: null,
	alpha: null,
	grime: null,
	colorGroup: null,
	material: null,
};

const hex = (value: number): string =>
	value.toString(16).padStart(2, "0").toUpperCase();

const toHexColor = (
	red: number | null,
	green: number | null,
	blue: number | null,
): string => `#${hex(red ?? 0)}${hex(green ?? 0)}${hex(blue ?? 0)}`;

const fromHexColor = (
	value: string,
): { red: number; green: number; blue: number } | null => {
	const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
	if (!match) return null;
	const numeric = Number.parseInt(match[1] ?? "", 16);
	return {
		red: (numeric >> 16) & 0xff,
		green: (numeric >> 8) & 0xff,
		blue: numeric & 0xff,
	};
};
const partKey = (item: DyedItem, index: number): string =>
	`${item.itemNo}:${item.slotNo}:${index}`;

/** The value the save holds for one channel of one part. */
const storedChannel = (
	slot: DyeSlot | undefined,
	name: keyof Channels,
): number | null => {
	const channel = slot
		? {
				red: slot.red,
				green: slot.green,
				blue: slot.blue,
				alpha: slot.alpha,
				grime: slot.grime,
				colorGroup: slot.colorGroup,
				material: slot.material,
			}[name]
		: null;
	return channel?.value ?? null;
};

/**
 * Equipment dyeing, part by part.
 *
 * Only gear that has been dyed in-game carries dye rows, and each row stores
 * only the channels that part actually uses — a part that tints without a
 * material has no material to change. Channels the save does not store show as
 * "not stored" and cannot be set: writing one means restructuring a record
 * nested inside the equipment block, which this editor will not do to a save it
 * cannot test in-game. Dye the item once in-game and it becomes editable here.
 */
export const DyesPanel = ({
	description,
	edits,
	busy,
	error,
	onStage,
}: PanelProps) => {
	const [picked, setPicked] = useState<string | null>(null);
	const items = description?.items ?? [];
	/**
	 * The chosen item falls back to the first one, so the panel opens on real
	 * dye rows rather than an empty table that fills in after a render.
	 */
	const item = useMemo(
		() =>
			items.find((candidate) => `${candidate.itemNo}` === picked) ??
			items[0] ??
			null,
		[items, picked],
	);
	const selected = item ? `${item.itemNo}` : null;

	const partEdit = (index: number): DyeEdit | undefined => {
		if (!item) return undefined;
		return edits.find(
			(candidate) =>
				candidate.itemNo === item.itemNo &&
				candidate.slotNo === item.slotNo &&
				candidate.slotIndices?.length === 1 &&
				candidate.slotIndices[0] === index,
		);
	};
	const bulkEdit = (): DyeEdit | undefined => {
		if (!item) return undefined;
		return edits.find(
			(candidate) =>
				candidate.itemNo === item.itemNo &&
				candidate.slotNo === item.slotNo &&
				candidate.slotIndices === null,
		);
	};

	const valuesOf = (index: number): Channels => {
		const edit = partEdit(index);
		return edit
			? {
					red: edit.red,
					green: edit.green,
					blue: edit.blue,
					alpha: edit.alpha,
					grime: edit.grime,
					colorGroup: edit.colorGroup,
					material: edit.material,
				}
			: EMPTY;
	};

	const stagePart = (index: number, patch: Partial<Channels>) => {
		if (!item) return;
		const slot = item.slots[index];
		// A channel set back to the value the save already holds is dropped: the
		// applier refuses an edit that changes nothing, and one redundant
		// keystroke should not fail the whole download.
		const normalized: Partial<Channels> = {};
		for (const [key, value] of Object.entries(patch)) {
			const name = key as keyof Channels;
			normalized[name] = value === storedChannel(slot, name) ? null : value;
		}
		const current = { ...EMPTY, ...valuesOf(index), ...normalized };
		const sameItem = (candidate: DyeEdit): boolean =>
			candidate.itemNo === item.itemNo && candidate.slotNo === item.slotNo;
		// The whole-item change goes first, then every part change that is not
		// this one, so a part edited afterwards wins over its own item's bulk edit.
		const others = edits.filter(
			(candidate) =>
				!sameItem(candidate) ||
				(candidate.slotIndices !== null && candidate.slotIndices[0] !== index),
		);
		const bulk = others.filter((candidate) => candidate.slotIndices === null);
		const singles = others.filter(
			(candidate) => candidate.slotIndices !== null,
		);
		onStage([
			...bulk,
			...singles,
			{
				type: "dye",
				itemNo: item.itemNo,
				itemKey: item.itemKey,
				slotNo: item.slotNo,
				slotIndices: [index],
				label: `${item.name} · part ${index + 1}`,
				...current,
			},
		]);
	};

	const stageAllParts = (slot: DyeSlot) => {
		if (!item) return;
		onStage([
			...edits.filter(
				(candidate) =>
					!(
						candidate.itemNo === item.itemNo &&
						candidate.slotNo === item.slotNo &&
						candidate.slotIndices === null
					),
			),
			{
				type: "dye",
				itemNo: item.itemNo,
				itemKey: item.itemKey,
				slotNo: item.slotNo,
				slotIndices: null,
				label: `${item.name} · every part like part ${slot.index + 1}`,
				red: slot.red?.value ?? null,
				green: slot.green?.value ?? null,
				blue: slot.blue?.value ?? null,
				alpha: slot.alpha?.value ?? null,
				grime: slot.grime?.value ?? null,
				colorGroup: slot.colorGroup?.value ?? null,
				material: slot.material?.value ?? null,
			},
		]);
	};

	const channel = (
		slot: DyeSlot,
		name: "red" | "green" | "blue" | "alpha" | "grime",
	) => {
		const stored = slot[name]?.value ?? null;
		const staged = valuesOf(slot.index)[name];
		const effective = staged ?? stored;
		return (
			<NumberInput
				size="xs"
				w={78}
				hideControls
				min={0}
				max={255}
				clampBehavior="strict"
				disabled={busy || (stored === null && staged === null)}
				placeholder="—"
				value={effective ?? ""}
				onChange={(next) =>
					stagePart(slot.index, {
						[name]:
							next === "" || next === undefined
								? null
								: Math.min(255, Math.max(0, Number(next))),
					})
				}
				aria-label={`${name} of part ${slot.index + 1}`}
			/>
		);
	};

	if (description?.error) {
		return (
			<Stack component="main" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Dye editing unavailable">
					{description.error}
				</Alert>
			</Stack>
		);
	}

	return (
		<Stack
			component="main"
			gap="lg"
			p="md"
			style={{ flex: 1, minHeight: 0, overflow: "auto" }}
		>
			{error && (
				<Alert color="red" title="Could not apply changes">
					{error}
				</Alert>
			)}

			<Group justify="space-between" gap="md" align="flex-start">
				<Box>
					<Group gap="xs">
						<Paintbrush size={18} color="var(--mantine-primary-color-filled)" />
						<Text component="h2" size="xl" fw={600}>
							Dye colours
						</Text>
					</Group>
					<Text mt={4} size="sm" c="dimmed">
						Recolour any part of the gear you have already dyed. Parts keep
						whichever channels the game stored for them.
					</Text>
				</Box>
				{description && (
					<Text size="sm" c="dimmed" ta="right">
						{items.length} dyed item{items.length === 1 ? "" : "s"}
					</Text>
				)}
			</Group>

			{items.length === 0 ? (
				<Alert color="yellow" title="Nothing is dyed yet">
					An item appears here once it has been dyed in-game. Dye anything —
					even a single part — then save and reopen it.
				</Alert>
			) : (
				<Group align="flex-end" gap="md">
					<Select
						w="100%"
						style={{ flex: 1, maxWidth: "26rem" }}
						label="Equipped item"
						value={selected}
						allowDeselect={false}
						data={items.map((entry) => ({
							value: `${entry.itemNo}`,
							label: `${entry.name} · ${entry.slots.length} part${
								entry.slots.length === 1 ? "" : "s"
							}`,
						}))}
						onChange={setPicked}
						searchable
					/>
					{edits.length > 0 && (
						<Button
							size="xs"
							variant="subtle"
							leftSection={<Undo2 size={14} />}
							disabled={busy}
							onClick={() => onStage([])}
						>
							Discard {edits.length} queued change
							{edits.length === 1 ? "" : "s"}
						</Button>
					)}
				</Group>
			)}

			{item && (
				<ScrollArea.Autosize
					mah={430}
					type="auto"
					style={{ border: "1px solid var(--mantine-color-dark-4)" }}
				>
					<Table stickyHeader highlightOnHover verticalSpacing="xs" fz="xs">
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Part</Table.Th>
								<Table.Th>Colour</Table.Th>
								<Table.Th>R</Table.Th>
								<Table.Th>G</Table.Th>
								<Table.Th>B</Table.Th>
								<Table.Th>A</Table.Th>
								<Table.Th>Grime</Table.Th>
								<Table.Th>Palette</Table.Th>
								<Table.Th>Material</Table.Th>
								<Table.Th />
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{item.slots.map((slot) => {
								const staged = valuesOf(slot.index);
								const red = staged.red ?? slot.red?.value ?? null;
								const green = staged.green ?? slot.green?.value ?? null;
								const blue = staged.blue ?? slot.blue?.value ?? null;
								const colorStored =
									Boolean(slot.red) ||
									Boolean(slot.green) ||
									Boolean(slot.blue);
								return (
									<Table.Tr key={partKey(item, slot.index)}>
										<Table.Td>
											<Text size="sm" fw={500}>
												{slot.name}
											</Text>
											{!slot.editable && (
												<Text size="10px" c="dimmed">
													no channels stored
												</Text>
											)}
										</Table.Td>
										<Table.Td>
											<ColorInput
												size="xs"
												w={120}
												format="hex"
												withEyeDropper={false}
												disabled={busy || !colorStored}
												placeholder="not stored"
												value={toHexColor(red, green, blue)}
												onChange={(value) => {
													const parsed = fromHexColor(value);
													if (parsed) stagePart(slot.index, parsed);
												}}
												aria-label={`colour of part ${slot.index + 1}`}
											/>
										</Table.Td>
										<Table.Td>{channel(slot, "red")}</Table.Td>
										<Table.Td>{channel(slot, "green")}</Table.Td>
										<Table.Td>{channel(slot, "blue")}</Table.Td>
										<Table.Td>{channel(slot, "alpha")}</Table.Td>
										<Table.Td>{channel(slot, "grime")}</Table.Td>
										<Table.Td>
											<Select
												size="xs"
												w={150}
												searchable
												disabled={busy || !slot.colorGroup}
												placeholder="not stored"
												value={
													(staged.colorGroup ?? slot.colorGroup?.value) === null
														? null
														: String(
																staged.colorGroup ?? slot.colorGroup?.value,
															)
												}
												data={(description?.colorGroups ?? []).map((group) => ({
													value: String(group.key),
													label: group.name,
												}))}
												onChange={(value) =>
													stagePart(slot.index, {
														colorGroup: value === null ? null : Number(value),
													})
												}
											/>
										</Table.Td>
										<Table.Td>
											<Select
												size="xs"
												w={110}
												disabled={busy || !slot.material}
												placeholder="not stored"
												value={
													(staged.material ?? slot.material?.value) === null
														? null
														: String(staged.material ?? slot.material?.value)
												}
												data={(description?.materials ?? []).map(
													(material) => ({
														value: String(material.value),
														label: material.name,
													}),
												)}
												onChange={(value) =>
													stagePart(slot.index, {
														material: value === null ? null : Number(value),
													})
												}
											/>
										</Table.Td>
										<Table.Td>
											<Button
												size="compact-xs"
												variant="subtle"
												disabled={busy || !colorStored}
												onClick={() => stageAllParts(slot)}
											>
												All parts
											</Button>
										</Table.Td>
									</Table.Tr>
								);
							})}
						</Table.Tbody>
					</Table>
				</ScrollArea.Autosize>
			)}

			{bulkEdit() && (
				<Paper
					withBorder
					p="sm"
					style={{ borderColor: "var(--mantine-primary-color-light)" }}
				>
					<Group gap="xs">
						<Badge size="xs" color="brand" variant="light">
							Every part
						</Badge>
						<Text size="xs" c="dimmed">
							{bulkEdit()?.label} is queued, and applies before any part you
							change after it.
						</Text>
					</Group>
				</Paper>
			)}
		</Stack>
	);
};
