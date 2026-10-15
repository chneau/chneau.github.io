import {
	ActionIcon,
	Box,
	NavLink,
	Select,
	SimpleGrid,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Picture } from "./picture";
import { VirtualList } from "./virtual-list";

export type CatalogEntry = {
	key: string;
	name: string;
	category: string;
	description: string;
	searchText?: string;
};

const ROW_STYLES = {
	label: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
	description: {
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
	},
} as const;

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
		all: string;
		category: string;
		search: string;
		list: string;
		empty: string;
	};
	rowHeight: number;
	maxHeight: number;
	getStatus: (entry: CatalogEntry) => string;
	getActive: (entry: CatalogEntry) => boolean;
	onSelect: (entry: CatalogEntry) => void;
	onFilterChange?: () => void;
}) => {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("");

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
					rightSection={
						query ? (
							<ActionIcon
								size="xs"
								variant="subtle"
								color="gray"
								onClick={() => {
									setQuery("");
									onFilterChange?.();
								}}
								title="Clear search"
								aria-label="Clear search"
							>
								<X size={14} />
							</ActionIcon>
						) : null
					}
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
