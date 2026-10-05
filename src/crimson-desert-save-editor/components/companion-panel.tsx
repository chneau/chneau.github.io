import {
	ActionIcon,
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
import { Plus, Search, TriangleAlert, Users, X } from "lucide-react";
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

/**
 * One row of the browser: the companion, how many the save holds, and the one
 * action its mode allows.
 *
 * A row is the unit both modes share — the picture, the name and the count are
 * the same in either — and it is what differs per mode that makes it worth
 * naming: "Add" stages a new companion, "Selected" only reports. Extracting it
 * is also what takes the modes out of the browser's own body, which otherwise
 * has to ask which mode it is at three separate points.
 */
const CompanionCard = ({
	row,
	mode,
	category,
	catalog,
	busy,
	onStage,
}: {
	row: CompanionBrowseRow;
	mode: "owned" | "add";
	category: CompanionCategory;
	catalog: CompanionCatalog | null;
	busy: boolean;
	onStage: (edit: CompanionEdit) => void;
}) => (
	<Paper withBorder p="sm">
		<Group gap="sm" wrap="nowrap">
			<Picture kind="companion" pictureKey={row.key} />
			<Box style={{ flex: 1, minWidth: 0 }}>
				<Text size="sm" fw={500}>
					{row.name}
					{row.count > 1 && (
						<Text span c="dimmed" ml="xs">
							× {row.count}
						</Text>
					)}
				</Text>
				{category !== "mounts" && (
					<Text size="sm" c="dimmed">
						{row.group}
					</Text>
				)}
				{mode === "add" && row.key === 1004233 && (
					<Text size="xs" c="dimmed">
						Includes Wyvern Saddle
					</Text>
				)}
			</Box>
			{mode === "add" ? (
				<Button
					size="xs"
					variant={row.status === "Add" ? "default" : "subtle"}
					aria-label={`${row.status} ${row.name}`}
					disabled={busy || row.status !== "Add"}
					title={
						catalog?.entries[String(row.key)]?.ownershipGroup
							? "One of this named mount type; existing variants count as owned."
							: undefined
					}
					onClick={() =>
						onStage({
							type: "addCompanion",
							characterKey: row.key,
							name: row.name,
							category,
						})
					}
				>
					{row.status === "Add" && <Plus size={14} />}
					{row.status}
				</Button>
			) : (
				row.selected && <Badge variant="outline">Selected</Badge>
			)}
		</Group>
	</Paper>
);

/**
 * What the browser says when its filters match nothing.
 *
 * Its own component because the message has three cases — filters too narrow,
 * nothing owned, nothing addable — and only the last two turn on the mode, so
 * the mode is what decides which of the three a reader is looking at.
 */
const BrowserEmptyState = ({
	mode,
	totalRows,
	onClearFilters,
}: {
	mode: "owned" | "add";
	/** How many rows the mode holds before any filter is applied. */
	totalRows: number;
	onClearFilters: () => void;
}) => (
	<Stack align="center" gap="xs" py="xl">
		<Text size="sm" c="dimmed">
			{totalRows
				? "No companions match these filters."
				: mode === "owned"
					? "No owned companions in this section."
					: "No additions are available for this save in this section."}
		</Text>
		{totalRows > 0 && (
			<Button variant="subtle" size="sm" onClick={onClearFilters}>
				Clear filters
			</Button>
		)}
	</Stack>
);

/**
 * One row per *type* of companion the save holds, not per save record.
 *
 * A save can hold four of the same dog, and the browser's job is to show that
 * as one row with a count — the reader is choosing what to act on, not counting
 * records, and a list repeating one name four times reads as four different
 * things to act on. Grouping is therefore by character key, summing the count
 * and the assignments, and folding `selected` with `||=`: whether *any* copy of
 * that type is selected is the only question a row asks.
 */
const ownedBrowseRows = (
	summary: CompanionSummary | undefined,
	catalog: CompanionCatalog | null,
	category: CompanionCategory,
): CompanionBrowseRow[] => {
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
	return [...owned.values()];
};

/** The browser's four inputs, as one value so they change together. */
type BrowserFilters = {
	query: string;
	group: string;
	sort: string;
	availableOnly: boolean;
};

/**
 * The search box and the two dropdowns that narrow the browser's rows.
 *
 * One component because all three are the same gesture — choose a value, and
 * the list below is a different list — and because each of them has to send the
 * browser back to its first page. That rule is stated once here, in the parent,
 * rather than repeated at every control: `onFilterChange` takes the whole new
 * filter value, so no control can change one field and forget the page reset.
 */
const BrowserFilters = ({
	category,
	mode,
	filters,
	totalRows,
	groupCounts,
	onFilterChange,
}: {
	category: CompanionCategory;
	mode: "owned" | "add";
	filters: BrowserFilters;
	totalRows: number;
	/** How many rows each group holds, for the group dropdown's labels. */
	groupCounts: Map<string, number>;
	onFilterChange: (next: Partial<BrowserFilters>) => void;
}) => (
	<Group align="flex-end" gap="md">
		<TextInput
			w="100%"
			style={{ flex: 1, minWidth: "12rem" }}
			label="Search"
			placeholder="Search names or breeds"
			value={filters.query}
			leftSection={<Search size={16} />}
			rightSection={
				filters.query ? (
					<ActionIcon
						size="xs"
						variant="subtle"
						color="gray"
						onClick={() => onFilterChange({ query: "" })}
						title="Clear search"
						aria-label="Clear search"
					>
						<X size={14} />
					</ActionIcon>
				) : null
			}
			onChange={(event) => onFilterChange({ query: event.currentTarget.value })}
			id={`${category}-${mode}-search`}
		/>
		<Select
			w={160}
			label={category === "mounts" ? "Breed" : "Animal type"}
			value={filters.group}
			data={[
				{ value: "all", label: `All types (${totalRows})` },
				...[...groupCounts]
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([name, count]) => ({
						value: name,
						label: `${name} (${count})`,
					})),
			]}
			allowDeselect={false}
			onChange={(value) => onFilterChange({ group: value ?? "all" })}
		/>
		<Select
			w={150}
			label="Sort by"
			value={filters.sort}
			data={[
				{ value: "az", label: "Name A–Z" },
				{ value: "za", label: "Name Z–A" },
				{ value: "type", label: "Type, then name" },
			]}
			allowDeselect={false}
			onChange={(value) => onFilterChange({ sort: value ?? "az" })}
		/>
	</Group>
);

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
	const [filters, setFilters] = useState<BrowserFilters>({
		query: "",
		group: "all",
		sort: "az",
		availableOnly: false,
	});
	const [page, setPage] = useState(0);
	// Two sources, one list. The "add" mode lists what the catalog offers this
	// save; the "owned" mode lists what the save holds. Until the catalog has
	// loaded there is nothing to offer, so the add list is empty and the tab
	// says so rather than showing a browser with no rows in it.
	const rows: CompanionBrowseRow[] =
		mode === "add"
			? catalog
				? companionAddRows(catalog, summary, edits, category)
				: []
			: ownedBrowseRows(summary, catalog, category);
	const groupCounts = new Map<string, number>();
	for (const row of rows) {
		groupCounts.set(row.group, (groupCounts.get(row.group) ?? 0) + 1);
	}
	const matches = browseCompanions(
		rows,
		filters.query,
		filters.group,
		filters.sort,
		filters.availableOnly,
	);
	const current = companionPage(matches, page);
	/**
	 * Return to the first page after a filter change.
	 *
	 * This used to take the change as a callback — `applyFilter(() => setQuery(v))`
	 * — which reads exactly like a `useState` updater, so
	 * `no-impure-state-updater` flagged every call that closed over `setQuery`
	 * and friends. Nothing was ever handed to React: the closure ran once,
	 * synchronously, from a real event handler. But the shape was a genuine
	 * ambiguity, so the callback is gone and each control now sends the fields
	 * it changes, and the page reset is shared here because "a filter changed, so
	 * page 0" is the invariant rather than a detail worth repeating per control.
	 */
	const onFilterChange = (next: Partial<BrowserFilters>) => {
		setFilters((current) => ({ ...current, ...next }));
		setPage(0);
	};
	return (
		<Paper withBorder p="md" bg="var(--app-surface-2)">
			<Stack gap="md">
				<BrowserFilters
					category={category}
					mode={mode}
					filters={filters}
					totalRows={rows.length}
					groupCounts={groupCounts}
					onFilterChange={onFilterChange}
				/>
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
							checked={filters.availableOnly}
							onChange={(event) =>
								onFilterChange({ availableOnly: event.currentTarget.checked })
							}
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
								<CompanionCard
									key={r.key}
									row={r}
									mode={mode}
									category={category}
									catalog={catalog}
									busy={busy}
									onStage={onStage}
								/>
							))}
						</SimpleGrid>
						{!matches.length && (
							<BrowserEmptyState
								mode={mode}
								totalRows={rows.length}
								onClearFilters={() =>
									onFilterChange({
										query: "",
										group: "all",
										availableOnly: false,
									})
								}
							/>
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

/** One staged edit paired with the React key that identifies it. */
type StagedCompanionRow = { edit: CompanionEdit; key: string };

/**
 * Key each staged companion edit on what it *is*, so removing one row does not
 * slide every row below it up a position and hand one row's element — and the
 * DOM inside it — to a different edit.
 *
 * An added companion carries the save's own `characterKey`, and it is unique
 * within the list: `stageCompanion` refuses a second edit for a character
 * already queued, so this half needs no tie-break.
 *
 * A queued worker batch is the awkward one: it names a quantity and a label and
 * nothing else, and two batches may well name the same quantity. Counting the
 * occurrences of each batch within its own identity is the only tie-break the
 * domain offers, and it is enough — two batches that agree on quantity are
 * interchangeable rows, so which of the pair React re-uses is not observable.
 */
const stagedCompanionRows = (edits: CompanionEdit[]): StagedCompanionRow[] => {
	const seen = new Map<string, number>();
	return edits.map((edit) => {
		const identity =
			edit.type === "addCompanion"
				? `companion:${edit.characterKey}`
				: `workers:${edit.quantity}`;
		const occurrence = seen.get(identity) ?? 0;
		seen.set(identity, occurrence + 1);
		return { edit, key: `${identity}#${occurrence}` };
	});
};

/**
 * The camp's robo-worker queue: how many are owned, how many may still be
 * added, and the field that queues more.
 *
 * A component of its own because the camp section has no browser at all — this
 * is the whole of what the tab does — so the quantity it holds is read by one
 * button here and nothing else in the panel.
 */
const RoboWorkerQueue = ({
	summary,
	edits,
	queued,
	remaining,
	busy,
	onStage,
}: {
	summary: CompanionSummary | undefined;
	edits: CompanionEdit[];
	queued: number;
	remaining: number;
	busy: boolean;
	onStage: (edit: CompanionEdit) => void;
}) => {
	const [quantity, setQuantity] = useState<number | string>(1);
	return (
		<Paper withBorder p="lg" bg="var(--app-surface-2)">
			<Group gap="xs">
				<Users size={20} color="var(--mantine-primary-color-filled)" />
				<Text size="lg" fw={500}>
					Add robo workers
				</Text>
			</Group>
			<Text mt="xs" size="sm" c="dimmed">
				{summary?.roboWorkers ?? 0} robots owned
				{queued ? ` + ${queued} staged` : ""} · {remaining} spaces remaining of
				500
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
	);
};

/** The staged additions this category is holding, and a way to drop each one. */
const StagedCompanionList = ({
	pending,
	busy,
	onDiscard,
}: {
	pending: StagedCompanionRow[];
	busy: boolean;
	onDiscard: (edit: CompanionEdit) => void;
}) => (
	<Paper
		withBorder
		p="md"
		style={{ borderColor: "var(--mantine-primary-color-light)" }}
		aria-label="Staged companion additions"
	>
		<Stack gap="xs">
			<Text size="sm" fw={500}>
				Staged for your next download
			</Text>
			<ScrollArea.Autosize mah={192} type="auto">
				{pending.map((row) => (
					<Group key={row.key} justify="space-between" gap="md" wrap="nowrap">
						<Text size="sm">
							{row.edit.type === "addRoboWorkers"
								? `${row.edit.quantity} × Grey-0`
								: row.edit.name}
						</Text>
						<Button
							size="compact-sm"
							variant="subtle"
							disabled={busy}
							onClick={() => onDiscard(row.edit)}
						>
							Remove
						</Button>
					</Group>
				))}
			</ScrollArea.Autosize>
		</Stack>
	</Paper>
);

/**
 * How many companions a staged edit stands for: one each, or a whole worker
 * batch's worth.
 *
 * It is counted rather than listed because the heading reports a single number
 * of "staged" things while the list below shows one row per edit — a batch of
 * fifty workers is one row and fifty companions, and the two counts are
 * deliberately not the same.
 */
const stagedCompanionCount = (pending: StagedCompanionRow[]): number =>
	pending.reduce(
		(total, row) =>
			total + (row.edit.type === "addRoboWorkers" ? row.edit.quantity : 1),
		0,
	);

/**
 * The two tabs every non-camp category has: what the save holds, and what it
 * could hold.
 *
 * The camp is the odd one out — it has workers to queue instead of a browser —
 * so the tabbed half is its own component and the panel's only branch is which
 * of the two it renders. The tab opens on "add" for a category the save holds
 * nothing of, because a save with no pets has nothing to inspect and the only
 * useful question is what it could have.
 */
const CompanionTabs = ({
	props,
	category,
	ownedCount,
}: {
	props: PanelProps;
	category: CompanionCategory;
	ownedCount: number;
}) => (
	<Tabs defaultValue={ownedCount ? "owned" : "add"}>
		<Tabs.List mb="md">
			<Tabs.Tab value="owned">Owned ({ownedCount})</Tabs.Tab>
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
						One entry per mount type. Existing variants of the same named mount
						count as owned.
					</Text>
				)}
				<CompanionBrowser {...props} mode="add" />
			</Stack>
		</Tabs.Panel>
	</Tabs>
);

/**
 * The panel's title and its counts: what the save holds here, and what this
 * category has staged for the next download.
 */
const CompanionHeading = ({
	category,
	ownedCount,
	pending,
}: {
	category: CompanionCategory;
	ownedCount: number;
	pending: StagedCompanionRow[];
}) => (
	<Group justify="space-between" gap="md">
		<Text component="h2" size="xl" fw={600}>
			{companionLabels[category]}
		</Text>
		<Text size="sm" c="dimmed">
			{ownedCount} {category === "camp" ? "total mercenaries" : "owned"}
			{pending.length ? ` · ${stagedCompanionCount(pending)} staged` : ""}
		</Text>
	</Group>
);

export const CompanionPanel = (props: PanelProps) => {
	const { category, summary, edits, busy, error, onStage, onDiscard } = props;
	const owned = (summary?.records ?? []).filter((r) => r.category === category);
	const pending = stagedCompanionRows(
		edits.filter((e) => e.category === category),
	);
	const remaining = remainingWorkers(summary?.roboWorkers ?? 0, edits);
	const queued = queuedWorkers(edits);
	return (
		<Stack component="section" gap="lg" p="md" style={{ flex: 1 }}>
			{(error || summary?.error) && (
				<Alert
					color="red"
					icon={<TriangleAlert size={16} />}
					title="Could not apply companion changes"
				>
					{error || summary?.error}
				</Alert>
			)}
			<CompanionHeading
				category={category}
				ownedCount={owned.length}
				pending={pending}
			/>
			{category === "camp" ? (
				<RoboWorkerQueue
					summary={summary}
					edits={edits}
					queued={queued}
					remaining={remaining}
					busy={busy}
					onStage={onStage}
				/>
			) : (
				<CompanionTabs
					props={props}
					category={category}
					ownedCount={owned.length}
				/>
			)}
			{pending.length > 0 && (
				<StagedCompanionList
					pending={pending}
					busy={busy}
					onDiscard={onDiscard}
				/>
			)}
		</Stack>
	);
};
