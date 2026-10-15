import {
	Box,
	Button,
	Card,
	Group,
	ScrollArea,
	Stack,
	Text,
	Tooltip,
} from "@mantine/core";
import { X } from "lucide-react";
import { previewValue } from "../edits";
import { formatPath, type JsonValue } from "../json";
import type { QuickAction, SaveEdit, SummaryRow } from "../types";

const cardStyle = {
	border: "1px solid var(--app-border)",
	background: "var(--app-surface)",
} as const;

const labelStyle = {
	fontSize: "11px",
	letterSpacing: "0.18em",
} as const;

const CardLabel = ({ children }: { children: string }) => (
	<Text
		size="11px"
		c="dimmed"
		tt="uppercase"
		fw={600}
		style={labelStyle}
		mb="sm"
	>
		{children}
	</Text>
);

export const SaveSummary = ({ rows }: { rows: readonly SummaryRow[] }) => (
	<Card padding="md" radius="md" style={cardStyle}>
		<CardLabel>This save</CardLabel>
		<Stack gap={6}>
			{rows.map((row) => (
				<Group key={row.label} justify="space-between" gap="xs" wrap="nowrap">
					<Text size="xs" c="dimmed" truncate>
						{row.label}
					</Text>
					<Text
						size="sm"
						fw={600}
						ff="monospace"
						truncate
						style={{
							color: row.emphasis
								? "var(--mantine-primary-color-filled)"
								: undefined,
						}}
					>
						{row.value}
					</Text>
				</Group>
			))}
		</Stack>
	</Card>
);

export const QuickChanges = ({
	actions,
	doc,
	onStage,
}: {
	actions: readonly QuickAction[];
	doc: JsonValue;
	onStage: (edits: readonly SaveEdit[]) => void;
}) => {
	if (actions.length === 0) return null;
	return (
		<Card padding="md" radius="md" style={cardStyle}>
			<CardLabel>Quick changes</CardLabel>
			<Stack gap="xs">
				{actions.map((action) => {
					const planned = action.plan(doc);
					return (
						<Button
							key={action.id}
							variant="light"
							fullWidth
							justify="flex-start"
							disabled={planned.length === 0}
							onClick={() => onStage(planned)}
							title={action.description}
						>
							{action.label}
						</Button>
					);
				})}
			</Stack>
		</Card>
	);
};

export const StagedEdits = ({
	edits,
	onRevert,
	onClear,
}: {
	edits: readonly SaveEdit[];
	onRevert: (path: SaveEdit["path"]) => void;
	onClear: () => void;
}) => (
	<Card padding="md" radius="md" style={cardStyle}>
		<Group justify="space-between" mb="sm">
			<Text size="11px" c="dimmed" tt="uppercase" fw={600} style={labelStyle}>
				Staged changes
			</Text>
			{edits.length > 0 ? (
				<Button
					size="compact-xs"
					variant="subtle"
					color="gray"
					onClick={onClear}
				>
					Clear all
				</Button>
			) : null}
		</Group>
		{edits.length === 0 ? (
			<Text size="xs" c="dimmed">
				Nothing changed yet. Edits are held here until you rebuild, so your file
				is only ever written once.
			</Text>
		) : (
			<ScrollArea.Autosize mah={260} type="auto">
				<Stack gap={4}>
					{edits.map((edit) => (
						<Group
							key={edit.id}
							gap={6}
							wrap="nowrap"
							py={4}
							style={{ borderBottom: "1px solid var(--app-border)" }}
						>
							<Box style={{ flex: 1, minWidth: 0 }}>
								<Text
									size="xs"
									ff="monospace"
									truncate
									title={formatPath(edit.path)}
								>
									{formatPath(edit.path) || "whole save"}
								</Text>
								<Text size="xs" c="dimmed" truncate>
									{previewValue(edit.before)} → {previewValue(edit.after)}
								</Text>
							</Box>
							<Tooltip label="Revert" withArrow>
								<Button
									size="compact-xs"
									variant="subtle"
									color="gray"
									aria-label={`Revert ${formatPath(edit.path)}`}
									onClick={() => onRevert(edit.path)}
								>
									<X size={13} strokeWidth={2} />
								</Button>
							</Tooltip>
						</Group>
					))}
				</Stack>
			</ScrollArea.Autosize>
		)}
	</Card>
);
