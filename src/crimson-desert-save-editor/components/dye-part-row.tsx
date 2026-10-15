import {
	Button,
	ColorInput,
	NumberInput,
	Select,
	Table,
	Text,
} from "@mantine/core";
import type { DyeDescription, DyeSlot } from "../lib/save-engine/dyes";
import type { DyeChannels } from "./dye-channels";

type ChannelName = "red" | "green" | "blue" | "alpha" | "grime";

export const DyePartRow = ({
	slot,
	staged,
	colorGroups,
	materials,
	busy,
	onStagePart,
	onStageAllParts,
}: {
	slot: DyeSlot;
	staged: DyeChannels;
	colorGroups: NonNullable<DyeDescription["colorGroups"]>;
	materials: NonNullable<DyeDescription["materials"]>;
	busy: boolean;
	onStagePart: (patch: Partial<DyeChannels>) => void;
	onStageAllParts: () => void;
}) => {
	const red = staged.red ?? slot.red?.value ?? null;
	const green = staged.green ?? slot.green?.value ?? null;
	const blue = staged.blue ?? slot.blue?.value ?? null;
	const colorStored =
		Boolean(slot.red) || Boolean(slot.green) || Boolean(slot.blue);

	const hex = (value: number | null): string =>
		(value ?? 0).toString(16).padStart(2, "0").toUpperCase();

	const channel = (name: ChannelName) => {
		const stored = slot[name]?.value ?? null;
		const stagedValue = staged[name];
		const effective = stagedValue ?? stored;
		return (
			<NumberInput
				size="xs"
				w={78}
				hideControls
				min={0}
				max={255}
				clampBehavior="strict"
				disabled={busy || (stored === null && stagedValue === null)}
				placeholder="—"
				value={effective ?? ""}
				onChange={(next) =>
					onStagePart({
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

	const lookup = (
		name: "colorGroup" | "material",
		width: number,
		options: { value: string; label: string }[],
		grouped: boolean,
	) => {
		const key = staged[name] ?? slot[name]?.value ?? null;
		return (
			<Select
				size="xs"
				w={width}
				searchable={grouped}
				disabled={busy || !slot[name]}
				placeholder="not stored"
				value={key === null ? null : String(key)}
				data={options}
				onChange={(value) =>
					onStagePart({ [name]: value === null ? null : Number(value) })
				}
			/>
		);
	};

	return (
		<Table.Tr>
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
					value={`#${hex(red)}${hex(green)}${hex(blue)}`}
					onChange={(value) => {
						const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
						if (!match) return;
						const numeric = Number.parseInt(match[1] ?? "", 16);
						onStagePart({
							red: (numeric >> 16) & 0xff,
							green: (numeric >> 8) & 0xff,
							blue: numeric & 0xff,
						});
					}}
					aria-label={`colour of part ${slot.index + 1}`}
				/>
			</Table.Td>
			<Table.Td>{channel("red")}</Table.Td>
			<Table.Td>{channel("green")}</Table.Td>
			<Table.Td>{channel("blue")}</Table.Td>
			<Table.Td>{channel("alpha")}</Table.Td>
			<Table.Td>{channel("grime")}</Table.Td>
			<Table.Td>
				{lookup(
					"colorGroup",
					150,
					colorGroups.map((group) => ({
						value: String(group.key),
						label: group.name,
					})),
					true,
				)}
			</Table.Td>
			<Table.Td>
				{lookup(
					"material",
					110,
					materials.map((material) => ({
						value: String(material.value),
						label: material.name,
					})),
					false,
				)}
			</Table.Td>
			<Table.Td>
				<Button
					size="compact-xs"
					variant="subtle"
					disabled={busy || !colorStored}
					onClick={onStageAllParts}
				>
					All parts
				</Button>
			</Table.Td>
		</Table.Tr>
	);
};
