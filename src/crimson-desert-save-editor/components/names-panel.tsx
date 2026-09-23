import {
	ActionIcon,
	Alert,
	Badge,
	Box,
	Button,
	Group,
	Pagination,
	ScrollArea,
	Stack,
	Table,
	Text,
	TextInput,
} from "@mantine/core";
import { Search, Signature, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
	type CompanionNameDescription,
	type CompanionNameRow,
	nameRejection,
} from "@/lib/save-engine/companion-names";
import type { CompanionRenameEdit } from "@/lib/staged-edits";

type PanelProps = {
	description?: CompanionNameDescription;
	edits: CompanionRenameEdit[];
	busy: boolean;
	error: string;
	onStage: (edits: CompanionRenameEdit[]) => void;
};

const PAGE_SIZE = 25;

/**
 * The names the player has given their pets, horses and camp crew.
 *
 * A name is a field the game only stores once it has been set, so most of the
 * roster has none: typing one creates it, and changing one replaces it. The
 * record is identified by its mercenary number, because several companions
 * share a species and only that number tells them apart.
 */
export const NamesPanel = ({
	description,
	edits,
	busy,
	error,
	onStage,
}: PanelProps) => {
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(0);
	const [notice, setNotice] = useState("");

	const limit = description?.nameLimit ?? 32;
	const rows = description?.rows ?? [];
	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return rows;
		return rows.filter(
			(row) =>
				row.displayName.toLowerCase().includes(needle) ||
				row.species.toLowerCase().includes(needle) ||
				String(row.mercenaryNo).includes(needle),
		);
	}, [query, rows]);
	const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
	const current = Math.min(page, pages - 1);
	const visible = matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

	const editFor = (row: CompanionNameRow): CompanionRenameEdit | undefined => {
		return edits.find((edit) => edit.mercenaryNo === row.mercenaryNo);
	};

	const stageName = (row: CompanionNameRow, value: string) => {
		const rest = edits.filter((edit) => edit.mercenaryNo !== row.mercenaryNo);
		const name = value.trim();
		if (name.length === 0) {
			setNotice("");
			onStage(rest);
			return;
		}
		const rejection = nameRejection(name);
		if (rejection) {
			setNotice(`${rejection}. Keeping the previous value.`);
			return;
		}
		setNotice("");
		onStage([
			...rest,
			{
				type: "renameCompanion",
				mercenaryNo: row.mercenaryNo,
				characterKey: row.characterKey,
				name,
				label: `${row.species} ${row.mercenaryNo}`,
			},
		]);
	};

	if (description?.error) {
		return (
			<Stack component="main" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Renaming unavailable">
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
			{notice && (
				<Alert color="yellow" title="That name cannot be used">
					{notice}
				</Alert>
			)}

			<Group justify="space-between" gap="md" align="flex-start">
				<Box>
					<Group gap="xs">
						<Signature size={18} color="var(--mantine-primary-color-filled)" />
						<Text component="h2" size="xl" fw={600}>
							Rename companions
						</Text>
					</Group>
					<Text mt={4} size="sm" c="dimmed">
						Your horses, pets, camp mercenaries and robo workers. The game shows
						the name you put here wherever it lists them.
					</Text>
				</Box>
				{description && (
					<Text size="sm" c="dimmed" ta="right">
						{rows.length.toLocaleString()} roster entries · names up to {limit}{" "}
						bytes
					</Text>
				)}
			</Group>

			{edits.length > 0 && (
				<Group gap="sm">
					<Badge variant="light" color="brand">
						{edits.length} name{edits.length === 1 ? "" : "s"} queued
					</Badge>
					<Button
						size="compact-xs"
						variant="subtle"
						leftSection={<Undo2 size={14} />}
						disabled={busy}
						onClick={() => onStage([])}
					>
						Discard
					</Button>
				</Group>
			)}

			<TextInput
				w="100%"
				maw="26rem"
				label="Search the roster"
				placeholder="Search current, species or number"
				leftSection={<Search size={16} />}
				rightSection={
					query ? (
						<ActionIcon
							size="xs"
							variant="subtle"
							color="gray"
							onClick={() => {
								setQuery("");
								setPage(0);
							}}
							title="Clear search"
							aria-label="Clear search"
						>
							<X size={14} />
						</ActionIcon>
					) : null
				}
				value={query}
				onChange={(event) => {
					setQuery(event.currentTarget.value);
					setPage(0);
				}}
			/>

			<Box>
				<ScrollArea.Autosize
					mah={430}
					type="auto"
					style={{ border: "1px solid var(--mantine-color-dark-4)" }}
				>
					<Table stickyHeader highlightOnHover verticalSpacing="xs" fz="xs">
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Companion</Table.Th>
								<Table.Th>Species</Table.Th>
								<Table.Th w={280}>Custom name</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{visible.map((row) => {
								const edit = editFor(row);
								return (
									<Table.Tr key={row.mercenaryNo}>
										<Table.Td>
											<Box style={{ minWidth: 0 }}>
												<Text size="sm" fw={500} truncate>
													{edit?.name ?? row.displayName}
												</Text>
												<Text size="10px" c="dimmed" ff="monospace">
													No. {row.mercenaryNo} · item {row.characterKey}
												</Text>
											</Box>
										</Table.Td>
										<Table.Td>
											<Group gap="xs" wrap="nowrap">
												<Badge
													size="xs"
													variant="light"
													color="brand"
													styles={{
														label: { textTransform: "none", fontWeight: 500 },
													}}
												>
													{row.category}
												</Badge>
												<Text size="xs" c="dimmed" truncate>
													{row.species}
												</Text>
											</Group>
										</Table.Td>
										<Table.Td>
											<TextInput
												size="xs"
												disabled={busy}
												placeholder={
													row.customName === null
														? "No custom name — type one"
														: row.customName
												}
												value={edit?.name ?? ""}
												rightSection={
													edit ? (
														<ActionIcon
															size="xs"
															variant="subtle"
															color="gray"
															onClick={() => stageName(row, "")}
															title="Revert custom name"
															aria-label="Revert custom name"
														>
															<X size={12} />
														</ActionIcon>
													) : null
												}
												onChange={(event) =>
													stageName(row, event.currentTarget.value)
												}
												aria-label={`name of companion ${row.mercenaryNo}`}
											/>
										</Table.Td>
									</Table.Tr>
								);
							})}
							{visible.length === 0 && (
								<Table.Tr>
									<Table.Td colSpan={3}>
										<Text size="sm" c="dimmed" ta="center" py="md">
											No roster entries match this search.
										</Text>
									</Table.Td>
								</Table.Tr>
							)}
						</Table.Tbody>
					</Table>
				</ScrollArea.Autosize>
				<Group justify="space-between" mt="sm">
					<Text size="xs" c="dimmed">
						{matches.length.toLocaleString()} entries
					</Text>
					<Pagination
						size="sm"
						total={pages}
						value={current + 1}
						onChange={(next) => setPage(next - 1)}
					/>
				</Group>
			</Box>
		</Stack>
	);
};
