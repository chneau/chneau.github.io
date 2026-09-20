import {
	Box,
	NavLink,
	Select,
	SimpleGrid,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Picture } from "@/components/picture";
import { VirtualList } from "@/components/virtual-list";

/**
 * One browsable row. The caller precomputes what the row shows and what the
 * search box matches, so this component never needs to know where the entries
 * came from.
 */
export type CatalogEntry = {
	/** Stable id: the list key, and what `onSelect` receives. */
	key: string;
	name: string;
	/** The heading a row groups under in the category filter. */
	category: string;
	/** Second line of the row. */
	description: string;
	/** Extra text the search box matches, beyond the name, category and key. */
	searchText?: string;
};

/**
 * Item names run long, so both lines are ellipsized rather than wrapped: a row
 * must stay exactly `rowHeight` tall or the window arithmetic drifts.
 */
const ROW_STYLES = {
	label: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
	description: {
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
	},
} as const;

/**
 * Search + category filter over a windowed catalog list.
 *
 * The add-item drawer and the equipment panel browse different catalogs and
 * their rows carry different status text, so the entries and the two per-row
 * callbacks come from the caller. Everything else — the filter boxes, the
 * category counts, the windowing, the empty state — lives here, so a filter or
 * windowing fix lands in one place instead of once per browser.
 *
 * The filters are owned here, which means they reset when the caller unmounts
 * this component (a drawer closing, or a destination storage changing).
 */
export const CatalogBrowser = ({
	entries,
	labels,
	rowHeight,
	maxHeight,
	getStatus,
	getActive,
	onSelect,
	onFilterChange,
}: {
	entries: CatalogEntry[];
	labels: {
		/** Label of the unfiltered option in the category select. */
		all: string;
		/** aria-label of the category select. */
		category: string;
		/** aria-label and placeholder of the search box. */
		search: string;
		/** aria-label of the list itself. */
		list: string;
		/** Shown in place of the list when nothing matches. */
		empty: string;
	};
	/** Every row renders at exactly this height. */
	rowHeight: number;
	/** The list scrolls instead of growing past this height. */
	maxHeight: number;
	/** Right-hand status text for a row, or `""` for none. */
	getStatus: (entry: CatalogEntry) => string;
	getActive: (entry: CatalogEntry) => boolean;
	onSelect: (entry: CatalogEntry) => void;
	/** Called when the search or the category changes, so a pick can be cleared. */
	onFilterChange?: () => void;
}) => {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("");

	// Counts sit in the option labels: the point of the filter is to find a
	// category with something in it, so an empty answer is worth announcing.
	const categories = useMemo(() => {
		const counts = new Map<string, number>();
		for (const entry of entries) {
			counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
		}
		return [...counts.entries()].sort(([left], [right]) =>
			left.localeCompare(right),
		);
	}, [entries]);

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return entries.filter(
			(entry) =>
				(category === "" || entry.category === category) &&
				(needle === "" ||
					`${entry.name} ${entry.searchText ?? ""} ${entry.key}`
						.toLowerCase()
						.includes(needle)),
		);
	}, [category, entries, query]);

	return (
		<Stack gap="sm">
			<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
				<Select
					aria-label={labels.category}
					value={category}
					data={[
						{ value: "", label: `${labels.all} · ${entries.length}` },
						...categories.map(([name, count]) => ({
							value: name,
							label: `${name} · ${count}`,
						})),
					]}
					allowDeselect={false}
					onChange={(value) => {
						setCategory(value ?? "");
						onFilterChange?.();
					}}
				/>
				<TextInput
					aria-label={labels.search}
					placeholder={labels.search}
					value={query}
					leftSection={<Search size={16} />}
					onChange={(event) => {
						setQuery(event.currentTarget.value);
						onFilterChange?.();
					}}
				/>
			</SimpleGrid>

			<Box style={{ border: "1px solid var(--mantine-color-default-border)" }}>
				{visible.length > 0 ? (
					<VirtualList
						ariaLabel={labels.list}
						items={visible}
						rowHeight={rowHeight}
						height={Math.min(maxHeight, visible.length * rowHeight)}
						getKey={(entry) => entry.key}
						renderRow={(entry) => (
							<NavLink
								h="100%"
								active={getActive(entry)}
								leftSection={<Picture kind="item" pictureKey={entry.key} />}
								label={entry.name}
								description={entry.description}
								rightSection={
									<Text size="xs" c="dimmed" w={96} ta="right" truncate>
										{getStatus(entry)}
									</Text>
								}
								styles={ROW_STYLES}
								onClick={() => onSelect(entry)}
							/>
						)}
					/>
				) : (
					<Text size="sm" c="dimmed" ta="center" py="xl">
						{labels.empty}
					</Text>
				)}
			</Box>

			<Text size="sm" c="dimmed">
				{visible.length.toLocaleString()} matches
			</Text>
		</Stack>
	);
};
