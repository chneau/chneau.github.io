import {
	Badge,
	Card,
	Group,
	NumberInput,
	Stack,
	Text,
	Tooltip,
} from "@mantine/core";
import { useState } from "react";
import { editId, pathKey } from "../edits";
import { getAtPath, type JsonValue } from "../json";
import type { SaveCheat, SaveEdit } from "../types";

const cardStyle = {
	border: "1px solid var(--app-border)",
	background: "var(--app-surface)",
} as const;

const labelStyle = {
	fontSize: "11px",
	letterSpacing: "0.18em",
} as const;

const descriptionProps = {
	withArrow: true,
	multiline: true,
	maw: 300,
} as const;

const groupCheats = (
	cheats: readonly SaveCheat[],
): readonly (readonly [string, readonly SaveCheat[]])[] => {
	const groups = new Map<string, SaveCheat[]>();
	for (const cheat of cheats) {
		const bucket = groups.get(cheat.group);
		if (bucket === undefined) {
			groups.set(cheat.group, [cheat]);
		} else {
			bucket.push(cheat);
		}
	}
	return [...groups.entries()];
};

export const SaveCheats = ({
	cheats,
	doc,
	staged,
	onStage,
}: {
	cheats: readonly SaveCheat[];
	doc: JsonValue;
	staged: ReadonlySet<string>;
	onStage: (edit: SaveEdit) => void;
}) => (
	<Stack gap="md">
		{groupCheats(cheats).map(([group, items]) => (
			<Card key={group} padding="md" radius="md" style={cardStyle}>
				<Text
					size="11px"
					c="dimmed"
					tt="uppercase"
					fw={600}
					style={labelStyle}
					mb="sm"
				>
					{group}
				</Text>
				<Stack gap="xs">
					{items.map((cheat) => (
						<CheatRow
							key={cheat.id}
							cheat={cheat}
							doc={doc}
							staged={staged.has(pathKey(cheat.path))}
							onStage={onStage}
						/>
					))}
				</Stack>
			</Card>
		))}
	</Stack>
);

const CheatRow = ({
	cheat,
	doc,
	staged,
	onStage,
}: {
	cheat: SaveCheat;
	doc: JsonValue;
	staged: boolean;
	onStage: (edit: SaveEdit) => void;
}) => {
	const value = getAtPath(doc, cheat.path);
	const [draft, setDraft] = useState<string | number | null>(null);

	if (typeof value !== "number") {
		return (
			<Group
				justify="space-between"
				gap="sm"
				wrap="nowrap"
				style={{ opacity: 0.55 }}
			>
				<Tooltip label={cheat.description} {...descriptionProps}>
					<Text size="sm" truncate>
						{cheat.label}
					</Text>
				</Tooltip>
				<Text size="xs" c="dimmed">
					not in this save
				</Text>
			</Group>
		);
	}

	const commit = (): void => {
		if (draft === null) return;
		const halfOpen = draft;
		setDraft(null);
		if (typeof halfOpen === "string" && halfOpen.trim().length === 0) return;
		const parsed = typeof halfOpen === "number" ? halfOpen : Number(halfOpen);
		if (!Number.isFinite(parsed)) return;
		const clamped = Math.min(
			cheat.max ?? Number.POSITIVE_INFINITY,
			Math.max(cheat.min ?? Number.NEGATIVE_INFINITY, parsed),
		);
		if (clamped === value) return;
		onStage({
			id: editId(cheat.path, clamped),
			label: cheat.label,
			path: cheat.path,
			before: value,
			after: clamped,
		});
	};

	return (
		<Group justify="space-between" gap="sm" wrap="nowrap">
			<Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
				<Tooltip label={cheat.description} {...descriptionProps}>
					<Text size="sm" truncate>
						{cheat.label}
					</Text>
				</Tooltip>
				{staged ? (
					<Badge size="xs" variant="light" color="yellow">
						staged
					</Badge>
				) : null}
			</Group>
			<Tooltip label={cheat.description} {...descriptionProps}>
				<NumberInput
					size="xs"
					thousandSeparator=","
					min={cheat.min}
					max={cheat.max}
					aria-label={`${cheat.label} value`}
					title={cheat.description}
					value={draft ?? value}
					onChange={setDraft}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter") commit();
						if (event.key === "Escape") setDraft(null);
					}}
					style={{ width: 150 }}
				/>
			</Tooltip>
		</Group>
	);
};
