import {
	ActionIcon,
	Badge,
	Box,
	Group,
	ScrollArea,
	Table,
	Text,
	TextInput,
	Tooltip,
	UnstyledButton,
} from "@mantine/core";
import { Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { editId, pathKey, previewValue } from "../edits";
import {
	getAtPath,
	type JsonValue,
	formatPath as pathToString,
	type SavePath,
} from "../json";
import type {
	SaveEdit,
	SaveTableColumn,
	SaveTable as SaveTableSpec,
} from "../types";

const EDITABLE = (value: JsonValue | undefined): value is JsonValue =>
	typeof value === "string" ||
	typeof value === "number" ||
	typeof value === "boolean";

export const SaveTable = ({
	table,
	doc,
	staged,
	onStage,
}: {
	table: SaveTableSpec;
	doc: JsonValue;
	staged: ReadonlySet<string>;
	onStage: (edit: SaveEdit) => void;
}) => {
	const [filter, setFilter] = useState("");
	const [editing, setEditing] = useState<string | null>(null);

	const tablePath = useMemo(
		() => table.resolvePath?.(doc) ?? table.path,
		[doc, table],
	);

	const rows = useMemo(() => {
		const value = getAtPath(doc, tablePath);
		if (!Array.isArray(value)) return null;
		const needle = filter.trim().toLowerCase();
		return value
			.map((row, index) => ({ row, index }))
			.filter(({ row, index }) => {
				if (needle.length === 0) return true;
				return table.columns.some((column) => {
					const value =
						column.read?.(row, index) ??
						getAtPath(row, column.resolvePath?.(row, index) ?? column.path);
					return (
						value !== undefined &&
						previewValue(value).toLowerCase().includes(needle)
					);
				});
			});
	}, [doc, filter, table, tablePath]);

	return (
		<Box style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
			<Group justify="space-between" mb="sm" wrap="nowrap">
				<TextInput
					size="xs"
					value={filter}
					onChange={(event) => setFilter(event.currentTarget.value)}
					placeholder={`Filter ${table.label.toLowerCase()}`}
					aria-label={`Filter ${table.label}`}
					style={{ flex: 1, maxWidth: 360 }}
				/>
				<Text size="xs" c="dimmed">
					{rows === null
						? "not in this save"
						: `${rows.length} row${rows.length === 1 ? "" : "s"}`}
				</Text>
			</Group>

			{rows === null ? (
				<Text size="sm" c="dimmed">
					{table.emptyMessage ??
						`This save does not carry the ${table.label.toLowerCase()} table.`}
				</Text>
			) : rows.length === 0 ? (
				<Text size="sm" c="dimmed">
					No row matches that filter.
				</Text>
			) : (
				<ScrollArea h={560} type="auto">
					<Table
						highlightOnHover
						withTableBorder
						withColumnBorders
						verticalSpacing={4}
						horizontalSpacing="sm"
						style={{ tableLayout: "auto" }}
					>
						<Table.Thead>
							<Table.Tr>
								{table.columns.map((column) => (
									<Table.Th
										key={column.label}
										style={{ width: column.width, whiteSpace: "nowrap" }}
									>
										{column.label}
									</Table.Th>
								))}
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{rows.map(({ row, index }) => {
								const rowPath = [...tablePath, index];
								return (
									<Table.Tr key={pathKey(rowPath)}>
										{table.columns.map((column) => {
											const cellPath =
												column.resolvePath?.(row, index) ?? column.path;
											const path = [...rowPath, ...cellPath];
											const value =
												column.read?.(row, index) ?? getAtPath(row, cellPath);
											return (
												<TableCell
													key={`${column.label}:${pathKey(cellPath)}`}
													path={path}
													column={column}
													value={value}
													staged={staged.has(pathKey(path))}
													editing={editing === pathKey(path)}
													onEdit={() => setEditing(pathKey(path))}
													onCancel={() => setEditing(null)}
													onStage={(after, before) => {
														onStage({
															id: editId(path, after),
															label: pathToString(path),
															path,
															before,
															after,
														});
														setEditing(null);
													}}
												/>
											);
										})}
									</Table.Tr>
								);
							})}
						</Table.Tbody>
					</Table>
				</ScrollArea>
			)}
		</Box>
	);
};

const TableCell = ({
	path,
	column,
	value,
	staged,
	editing,
	onEdit,
	onCancel,
	onStage,
}: {
	path: SavePath;
	column: SaveTableColumn;
	value: JsonValue | undefined;
	staged: boolean;
	editing: boolean;
	onEdit: () => void;
	onCancel: () => void;
	onStage: (after: JsonValue, before: JsonValue) => void;
}) => {
	const [draft, setDraft] = useState<string | null>(null);
	const key = pathToString(path);

	const commit = (): void => {
		if (draft === null || value === undefined) return;
		const parsed = parseScalar(draft, value);
		setDraft(null);
		if (
			parsed === undefined ||
			JSON.stringify(parsed) === JSON.stringify(value)
		) {
			return;
		}
		onStage(parsed, value);
	};

	if (value === undefined || value === null) {
		return (
			<Table.Td style={{ width: column.width }}>
				<Text size="xs" c="dimmed">
					—
				</Text>
			</Table.Td>
		);
	}

	const editable = column.readOnly !== true && EDITABLE(value);

	return (
		<Table.Td style={{ width: column.width }}>
			{editing && editable ? (
				<TextInput
					size="xs"
					autoFocus
					aria-label={`Edit ${key}`}
					value={draft ?? String(value)}
					onInput={(event) => setDraft(event.currentTarget.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter") commit();
						if (event.key === "Escape") {
							setDraft(null);
							onCancel();
						}
					}}
				/>
			) : (
				<Group gap={6} wrap="nowrap">
					{editable ? (
						<Tooltip label={`Edit ${key}`} withArrow>
							<UnstyledButton
								onClick={onEdit}
								aria-label={`Edit ${key}`}
								style={{ minWidth: 0 }}
							>
								<Text size="sm" ff="monospace" truncate>
									{previewValue(value)}
								</Text>
							</UnstyledButton>
						</Tooltip>
					) : (
						<Text size="sm" ff="monospace" truncate>
							{previewValue(value)}
						</Text>
					)}
					{staged ? (
						<Badge size="xs" variant="light" color="yellow">
							staged
						</Badge>
					) : null}
					{editable ? (
						<ActionIcon
							size="xs"
							variant="subtle"
							color="gray"
							onClick={onEdit}
							aria-label={`Edit ${key}`}
						>
							<Pencil size={12} strokeWidth={2} />
						</ActionIcon>
					) : null}
				</Group>
			)}
		</Table.Td>
	);
};

const parseScalar = (
	draft: string,
	previous: JsonValue,
): JsonValue | undefined => {
	if (typeof previous === "number") {
		const parsed = Number(draft);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	if (typeof previous === "boolean") {
		const lowered = draft.trim().toLowerCase();
		if (lowered === "true") return true;
		if (lowered === "false") return false;
		return undefined;
	}
	return draft;
};
