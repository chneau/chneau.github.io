import {
	ActionIcon,
	Badge,
	Box,
	Group,
	ScrollArea,
	Text,
	TextInput,
	Tooltip,
	UnstyledButton,
} from "@mantine/core";
import { ChevronRight, Pencil, Search, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { editId, pathKey, previewValue } from "../edits";
import {
	collectLeaves,
	type JsonValue,
	formatPath as pathToString,
	type SavePath,
} from "../json";
import type { SaveEdit } from "../types";

export const JsonInspector = ({
	doc,
	staged,
	onStage,
	search,
	onSearchChange,
}: {
	doc: JsonValue;
	staged: ReadonlySet<string>;
	onStage: (edit: SaveEdit) => void;
	search: string;
	onSearchChange: (value: string) => void;
}) => {
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		new Set<string>(),
	);
	const [editing, setEditing] = useState<string | null>(null);

	const toggle = useCallback((key: string) => {
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	const results = useMemo(() => {
		const needle = search.trim().toLowerCase();
		if (needle.length === 0) return null;
		return collectLeaves(doc)
			.filter((leaf) => pathToString(leaf.path).toLowerCase().includes(needle))
			.slice(0, 300);
	}, [doc, search]);

	return (
		<Box style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
			<TextInput
				value={search}
				onChange={(event) => onSearchChange(event.currentTarget.value)}
				placeholder="Search every field, e.g. gold"
				aria-label="Search every field"
				leftSection={<Search size={15} strokeWidth={2} />}
				rightSection={
					search ? (
						<ActionIcon
							variant="subtle"
							color="gray"
							onClick={() => onSearchChange("")}
							aria-label="Clear search"
						>
							<X size={15} strokeWidth={2} />
						</ActionIcon>
					) : null
				}
				mb="sm"
				style={{ flexShrink: 0 }}
			/>

			<ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
				{results ? (
					<Box pb="md">
						<Text size="xs" c="dimmed" mb="xs">
							{results.length === 0
								? "No field matches that search."
								: `${results.length}${
										results.length === 300 ? "+" : ""
									} matching field${results.length === 1 ? "" : "s"}`}
						</Text>
						{results.map((leaf) => (
							<LeafRow
								key={pathKey(leaf.path)}
								path={leaf.path}
								value={leaf.value}
								staged={staged.has(pathKey(leaf.path))}
								editing={editing === pathKey(leaf.path)}
								onEdit={() => setEditing(pathKey(leaf.path))}
								onCancel={() => setEditing(null)}
								onStage={(after) => {
									onStage({
										id: editId(leaf.path, after),
										label: pathToString(leaf.path),
										path: leaf.path,
										before: leaf.value,
										after,
									});
									setEditing(null);
								}}
							/>
						))}
					</Box>
				) : (
					<Tree
						doc={doc}
						path={[]}
						depth={0}
						expanded={expanded}
						onToggle={toggle}
						staged={staged}
						editing={editing}
						onEdit={setEditing}
						onCancel={() => setEditing(null)}
						onStage={onStage}
					/>
				)}
			</ScrollArea>
		</Box>
	);
};

const INDENT = 14;

const Tree = ({
	doc,
	path,
	depth,
	expanded,
	onToggle,
	staged,
	editing,
	onEdit,
	onCancel,
	onStage,
}: {
	doc: JsonValue;
	path: SavePath;
	depth: number;
	expanded: ReadonlySet<string>;
	onToggle: (key: string) => void;
	staged: ReadonlySet<string>;
	editing: string | null;
	onEdit: (key: string) => void;
	onCancel: () => void;
	onStage: (edit: SaveEdit) => void;
}) => {
	const key = pathKey(path);
	const open = expanded.has(key);

	if (typeof doc !== "object" || doc === null) {
		return (
			<LeafRow
				path={path}
				value={doc}
				staged={staged.has(key)}
				editing={editing === key}
				onEdit={() => onEdit(key)}
				onCancel={onCancel}
				onStage={(after) =>
					onStage({
						id: editId(path, after),
						label: pathToString(path),
						path,
						before: doc,
						after,
					})
				}
			/>
		);
	}

	const entries: readonly (readonly [string, JsonValue])[] = Array.isArray(doc)
		? doc.map((item, index): readonly [string, JsonValue] => [
				String(index),
				item,
			])
		: Object.entries(doc as { readonly [k: string]: JsonValue });

	const count = entries.length;
	if (count === 0) {
		return (
			<Group gap={6} pl={depth * INDENT} py={2} wrap="nowrap">
				<Text size="sm" c="dimmed" ff="monospace">
					{depth === 0 ? "empty save" : "empty"}
				</Text>
			</Group>
		);
	}

	return (
		<Box>
			<UnstyledButton
				aria-expanded={open}
				onClick={() => onToggle(key)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					width: "100%",
					paddingLeft: depth * INDENT,
					paddingTop: 2,
					paddingBottom: 2,
					textAlign: "left",
				}}
			>
				<ChevronRight
					size={13}
					strokeWidth={2.5}
					style={{
						transform: open ? "rotate(90deg)" : "none",
						transition: "transform 140ms var(--app-ease)",
						flexShrink: 0,
					}}
				/>
				<Text component="span" size="sm" ff="monospace" fw={500}>
					{depth === 0 ? "save" : path[path.length - 1]}
				</Text>
				<Badge size="xs" variant="light" color="gray">
					{Array.isArray(doc)
						? `${count}`
						: `${count} field${count === 1 ? "" : "s"}`}
				</Badge>
			</UnstyledButton>
			{open
				? entries.map(([childKey, child]) => (
						<Tree
							key={`${key}/${childKey}`}
							doc={child}
							path={[...path, Array.isArray(doc) ? Number(childKey) : childKey]}
							depth={depth + 1}
							expanded={expanded}
							onToggle={onToggle}
							staged={staged}
							editing={editing}
							onEdit={onEdit}
							onCancel={onCancel}
							onStage={onStage}
						/>
					))
				: null}
		</Box>
	);
};

const LeafRow = ({
	path,
	value,
	staged,
	editing,
	onEdit,
	onCancel,
	onStage,
}: {
	path: SavePath;
	value: JsonValue;
	staged: boolean;
	editing: boolean;
	onEdit: () => void;
	onCancel: () => void;
	onStage: (after: JsonValue) => void;
}) => {
	const key = pathToString(path);
	const [draft, setDraft] = useState<string | null>(null);

	const commit = (): void => {
		if (draft === null) return;
		const parsed = parseScalar(draft, value);
		setDraft(null);
		if (
			parsed === undefined ||
			JSON.stringify(parsed) === JSON.stringify(value)
		) {
			return;
		}
		onStage(parsed);
	};

	return (
		<Group
			gap={8}
			py={3}
			wrap="nowrap"
			style={{ borderBottom: "1px solid var(--app-border)" }}
		>
			<Text
				size="xs"
				ff="monospace"
				c="dimmed"
				style={{ flexShrink: 0, maxWidth: "45%" }}
				truncate
				title={key}
			>
				{path[path.length - 1]}
			</Text>
			{staged ? (
				<Badge size="xs" variant="light" color="yellow">
					staged
				</Badge>
			) : null}
			<Box style={{ flex: 1, minWidth: 0 }}>
				{editing ? (
					<TextInput
						size="xs"
						autoFocus
						aria-label={`Edit ${key}`}
						value={draft ?? scalarToDraft(value)}
						onChange={(event) => setDraft(event.currentTarget.value)}
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
					<Text size="sm" ff="monospace" truncate title={String(value)}>
						{previewValue(value)}
					</Text>
				)}
			</Box>
			{editing ? null : (
				<Tooltip label={`Edit ${key}`} withArrow>
					<ActionIcon
						variant="subtle"
						color="gray"
						onClick={onEdit}
						aria-label={`Edit ${key}`}
					>
						<Pencil size={13} strokeWidth={2} />
					</ActionIcon>
				</Tooltip>
			)}
		</Group>
	);
};

const scalarToDraft = (value: JsonValue): string =>
	typeof value === "string" ? value : String(value);

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
