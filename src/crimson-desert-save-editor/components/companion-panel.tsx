import {
	Alert,
	Badge,
	Box,
	Button,
	Checkbox,
	Group,
	NumberInput,
	Pagination,
	Paper,
	ScrollArea,
	Select,
	SimpleGrid,
	Stack,
	Tabs,
	Text,
	TextInput,
} from "@mantine/core";
import { Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { Picture } from "@/components/picture";
import {
	browseCompanions,
	COMPANION_PAGE_SIZE,
	type CompanionBrowseRow,
	type CompanionCatalog,
	type CompanionCategory,
	type CompanionEdit,
	type CompanionSummary,
	canQueueWorkers,
	companionAddRows,
	companionLabels,
	companionPage,
	queuedWorkers,
	remainingWorkers,
} from "@/lib/companions";

type PanelProps = {
	category: CompanionCategory;
	summary?: CompanionSummary;
	catalog: CompanionCatalog | null;
	edits: CompanionEdit[];
	busy: boolean;
	error: string;
	onStage: (edit: CompanionEdit) => void;
	onDiscard: (edit: CompanionEdit) => void;
};

const CompanionBrowser = ({
	category,
	summary,
	catalog,
	edits,
	busy,
	onStage,
	mode,
}: PanelProps & {
	mode: "owned" | "add";
}) => {
	const [query, setQuery] = useState("");
	const [group, setGroup] = useState("all");
	const [sort, setSort] = useState("az");
	const [availableOnly, setAvailableOnly] = useState(false);
	const [page, setPage] = useState(0);
	const rows: CompanionBrowseRow[] = [];
	if (mode === "add" && catalog) {
		rows.push(...companionAddRows(catalog, summary, edits, category));
	} else {
		const owned = new Map<number, CompanionBrowseRow>();
		for (const r of summary?.records ?? []) {
			if (r.category !== category) continue;
			const row = owned.get(r.characterKey) ?? {
				key: r.characterKey,
				name: r.species,
				group: catalog?.entries[String(r.characterKey)]?.browseGroup ?? "Other",
				status: "Owned",
				count: 0,
				assigned: 0,
				selected: false,
			};
			row.count++;
			row.assigned += Number(r.assigned);
			row.selected ||= r.selected;
			owned.set(r.characterKey, row);
		}
		rows.push(...owned.values());
	}
	const groupCounts = new Map<string, number>();
	for (const row of rows) {
		groupCounts.set(row.group, (groupCounts.get(row.group) ?? 0) + 1);
	}
	const matches = browseCompanions(rows, query, group, sort, availableOnly);
	const current = companionPage(matches, page);
	const update = (action: () => void) => {
		action();
		setPage(0);
	};
	const groupLabel = category === "mounts" ? "Breed" : "Animal type";
	return (
		<Paper withBorder p="md" bg="var(--mantine-color-dark-7)">
			<Stack gap="md">
				<Group align="flex-end" gap="md">
					<TextInput
						w="100%"
						style={{ flex: 1, minWidth: "12rem" }}
						label="Search"
						placeholder="Search names or breeds"
						value={query}
						leftSection={<Search size={16} />}
						onChange={(event) => {
							const value = event.currentTarget.value;
							update(() => setQuery(value));
						}}
						id={`${category}-${mode}-search`}
					/>
					<Select
						w={160}
						label={groupLabel}
						value={group}
						data={[
							{ value: "all", label: `All types (${rows.length})` },
							...[...groupCounts]
								.sort(([a], [b]) => a.localeCompare(b))
								.map(([name, count]) => ({
									value: name,
									label: `${name} (${count})`,
								})),
						]}
						allowDeselect={false}
						onChange={(value) => update(() => setGroup(value ?? "all"))}
					/>
					<Select
						w={150}
						label="Sort by"
						value={sort}
						data={[
							{ value: "az", label: "Name A–Z" },
							{ value: "za", label: "Name Z–A" },
							{ value: "type", label: "Type, then name" },
						]}
						allowDeselect={false}
						onChange={(value) => update(() => setSort(value ?? "az"))}
					/>
				</Group>
				<Group justify="space-between" gap="md">
					<Text size="sm" c="dimmed" aria-live="polite" component="p">
						{matches.length
							? `${current.page * COMPANION_PAGE_SIZE + 1}–${Math.min(
									(current.page + 1) * COMPANION_PAGE_SIZE,
									matches.length,
								)} of ${matches.length}`
							: "0 results"}
						{mode === "add" ? " choices" : " owned types"}
					</Text>
					{mode === "add" && (
						<Checkbox
							label="Available to add only"
							checked={availableOnly}
							onChange={(event) => {
								const value = event.currentTarget.checked;
								update(() => setAvailableOnly(value));
							}}
						/>
					)}
				</Group>
				{mode === "add" && !catalog ? (
					<Text size="sm" c="dimmed" py="xl">
						Loading companion catalog…
					</Text>
				) : (
					<>
						<SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="xs">
							{current.rows.map((r) => (
								<Paper key={r.key} withBorder p="sm">
									<Group gap="sm" wrap="nowrap">
										<Picture kind="companion" pictureKey={r.key} />
										<Box style={{ flex: 1, minWidth: 0 }}>
											<Text size="sm" fw={500}>
												{r.name}
												{r.count > 1 && (
													<Text span c="dimmed" ml="xs">
														× {r.count}
													</Text>
												)}
											</Text>
											{category !== "mounts" && (
												<Text size="sm" c="dimmed">
													{r.group}
												</Text>
											)}
											{mode === "add" && r.key === 1004233 && (
												<Text size="xs" c="dimmed">
													Includes Wyvern Saddle
												</Text>
											)}
										</Box>
										{mode === "add" ? (
											<Button
												size="xs"
												variant={r.status === "Add" ? "default" : "subtle"}
												aria-label={`${r.status} ${r.name}`}
												disabled={busy || r.status !== "Add"}
												title={
													catalog?.entries[String(r.key)]?.ownershipGroup
														? "One of this named mount type; existing variants count as owned."
														: undefined
												}
												onClick={() =>
													onStage({
														type: "addCompanion",
														characterKey: r.key,
														name: r.name,
														category,
													})
												}
											>
												{r.status === "Add" && <Plus size={14} />}
												{r.status}
											</Button>
										) : (
											r.selected && <Badge variant="outline">Selected</Badge>
										)}
									</Group>
								</Paper>
							))}
						</SimpleGrid>
						{!matches.length && (
							<Stack align="center" gap="xs" py="xl">
								<Text size="sm" c="dimmed">
									{rows.length
										? "No companions match these filters."
										: mode === "owned"
											? "No owned companions in this section."
											: "No additions are available for this save in this section."}
								</Text>
								{rows.length > 0 && (
									<Button
										variant="subtle"
										size="sm"
										onClick={() =>
											update(() => {
												setQuery("");
												setGroup("all");
												setAvailableOnly(false);
											})
										}
									>
										Clear filters
									</Button>
								)}
							</Stack>
						)}
						{current.pages > 1 && (
							<Group justify="flex-end">
								<Pagination
									total={current.pages}
									value={current.page + 1}
									onChange={(value) => setPage(value - 1)}
									withEdges
									aria-label={`${
										mode === "add" ? "Catalog" : "Owned companion"
									} pages`}
								/>
							</Group>
						)}
					</>
				)}
			</Stack>
		</Paper>
	);
};

export const CompanionPanel = (props: PanelProps) => {
	const { category, summary, edits, busy, error, onStage, onDiscard } = props;
	const [quantity, setQuantity] = useState<number | string>(1);
	const owned = (summary?.records ?? []).filter((r) => r.category === category);
	const pending = edits.filter((e) => e.category === category);
	const remaining = remainingWorkers(summary?.roboWorkers ?? 0, edits);
	const queued = queuedWorkers(edits);
	return (
		<Stack component="main" gap="lg" p="md" style={{ flex: 1 }}>
			{(error || summary?.error) && (
				<Alert color="red" title="Could not apply changes">
					{error || summary?.error}
				</Alert>
			)}
			<Group justify="space-between" gap="md">
				<Text component="h2" size="xl" fw={600}>
					{companionLabels[category]}
				</Text>
				<Text size="sm" c="dimmed">
					{owned.length} {category === "camp" ? "total mercenaries" : "owned"}
					{pending.length
						? ` · ${pending.reduce(
								(n, e) => n + (e.type === "addRoboWorkers" ? e.quantity : 1),
								0,
							)} queued`
						: ""}
				</Text>
			</Group>
			{category === "camp" ? (
				<Paper withBorder p="lg" bg="var(--mantine-color-dark-7)">
					<Group gap="xs">
						<Users size={20} color="var(--mantine-primary-color-filled)" />
						<Text size="lg" fw={500}>
							Add robo workers
						</Text>
					</Group>
					<Text mt="xs" size="sm" c="dimmed">
						{summary?.roboWorkers ?? 0} robots owned
						{queued ? ` + ${queued} queued` : ""} · {remaining} spaces remaining
						of 500
					</Text>
					<Group mt="md" gap="md" w="100%" maw={384}>
						<NumberInput
							aria-label="Robo workers to add"
							min={1}
							max={remaining}
							step={1}
							value={quantity}
							disabled={busy || remaining === 0 || !summary?.workersSupported}
							onChange={setQuantity}
							style={{ flex: 1 }}
						/>
						<Button
							disabled={
								busy ||
								!summary?.workersSupported ||
								!summary.availableKeys.includes(1000006) ||
								!canQueueWorkers(summary.roboWorkers, edits, Number(quantity))
							}
							leftSection={<Plus size={16} />}
							onClick={() => {
								onStage({
									type: "addRoboWorkers",
									quantity: Number(quantity),
									name: "Grey-0 robo workers",
									category: "camp",
								});
								setQuantity(1);
							}}
						>
							Queue workers
						</Button>
					</Group>
					<Text mt="sm" size="sm" c="dimmed">
						{remaining === 0
							? "The 500-robot cap is reached. Existing workers are preserved."
							: !summary?.workersSupported
								? "Worker additions are available for saves that already have robo workers. Pre-camp additions are not supported yet."
								: "New robots start idle. Assigned and idle robots count toward the cap; other mercenaries do not."}
					</Text>
				</Paper>
			) : (
				<Tabs defaultValue={owned.length ? "owned" : "add"}>
					<Tabs.List mb="md">
						<Tabs.Tab value="owned">Owned ({owned.length})</Tabs.Tab>
						<Tabs.Tab value="add">
							Add{" "}
							{category === "pets"
								? "pets"
								: category === "mounts"
									? "horses"
									: "mounts"}
						</Tabs.Tab>
					</Tabs.List>
					<Tabs.Panel value="owned">
						<CompanionBrowser {...props} mode="owned" />
					</Tabs.Panel>
					<Tabs.Panel value="add">
						<Stack gap="sm">
							<Text size="sm" c="dimmed">
								{category === "pets"
									? "Pets are added without equipment."
									: category === "mounts"
										? "Choose a horse for your stable. Horses are added without equipment."
										: "Choose a permanently registerable mount. Dragon and A.T.A.G. are excluded."}
							</Text>
							{category === "specialMounts" && (
								<Text size="sm" c="dimmed">
									One entry per mount type. Existing variants of the same named
									mount count as owned.
								</Text>
							)}
							<CompanionBrowser {...props} mode="add" />
						</Stack>
					</Tabs.Panel>
				</Tabs>
			)}
			{pending.length > 0 && (
				<Paper
					withBorder
					p="md"
					style={{ borderColor: "var(--mantine-primary-color-light)" }}
					aria-label="Queued companion additions"
				>
					<Stack gap="xs">
						<Text size="sm" fw={500}>
							Queued for your next download
						</Text>
						<ScrollArea.Autosize mah={192} type="auto">
							{pending.map((edit, i) => {
								// Queued companion edits carry no identifier of their own, and the
								// list only ever appends, so the position is the only key available.
								const key = `queued-companion-${i}`;
								return (
									<Group
										key={key}
										justify="space-between"
										gap="md"
										wrap="nowrap"
									>
										<Text size="sm">
											{edit.type === "addRoboWorkers"
												? `${edit.quantity} × Grey-0`
												: edit.name}
										</Text>
										<Button
											size="compact-sm"
											variant="subtle"
											disabled={busy}
											onClick={() => onDiscard(edit)}
										>
											Discard
										</Button>
									</Group>
								);
							})}
						</ScrollArea.Autosize>
					</Stack>
				</Paper>
			)}
		</Stack>
	);
};
