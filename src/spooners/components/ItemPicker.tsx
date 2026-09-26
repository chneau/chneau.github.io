import { Box, Group, InputBase, Popover, Text } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemInfo } from "../types";

const ROW_HEIGHT = 34;
const VIEWPORT = 264;
const OVERSCAN = 6;

type Props = {
	items: ItemInfo[];
	value: string | null;
	onChange: (name: string) => void;
	label?: string;
};

/**
 * Searchable item picker with a virtualised dropdown: only the visible rows are
 * rendered, so the 1,600+ items cost the same as a handful.
 */
export const ItemPicker = ({ items, value, onChange, label }: Props) => {
	const [opened, setOpened] = useState(false);
	const [query, setQuery] = useState("");
	const [highlight, setHighlight] = useState(0);
	const [scrollTop, setScrollTop] = useState(0);
	const viewportRef = useRef<HTMLDivElement>(null);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) {
			return items;
		}
		return items.filter(
			(item) =>
				item.name.toLowerCase().includes(needle) ||
				(item.menu?.toLowerCase().includes(needle) ?? false) ||
				(item.category?.toLowerCase().includes(needle) ?? false),
		);
	}, [items, query]);

	// keep the highlight in range as the results shrink
	useEffect(() => {
		setHighlight(0);
		setScrollTop(0);
		if (viewportRef.current) {
			viewportRef.current.scrollTop = 0;
		}
	}, [query]);

	const scrollToRow = (index: number) => {
		const viewport = viewportRef.current;
		if (!viewport) {
			return;
		}
		const top = index * ROW_HEIGHT;
		if (top < viewport.scrollTop) {
			viewport.scrollTop = top;
		} else if (top + ROW_HEIGHT > viewport.scrollTop + VIEWPORT) {
			viewport.scrollTop = top + ROW_HEIGHT - VIEWPORT;
		}
	};

	const move = (delta: number) => {
		if (!filtered.length) {
			return;
		}
		const next = Math.min(Math.max(highlight + delta, 0), filtered.length - 1);
		setHighlight(next);
		scrollToRow(next);
	};

	const select = (index: number) => {
		const item = filtered[index];
		if (!item) {
			return;
		}
		onChange(item.name);
		setOpened(false);
		setQuery("");
	};

	const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
	const end = Math.min(
		filtered.length,
		Math.ceil((scrollTop + VIEWPORT) / ROW_HEIGHT) + OVERSCAN,
	);
	const visible = filtered.slice(start, end);

	return (
		<Popover
			opened={opened}
			onChange={setOpened}
			position="bottom-start"
			width="target"
			withinPortal
			shadow="md"
			transitionProps={{ duration: 0 }}
		>
			<Popover.Target>
				<InputBase
					label={label}
					placeholder="Search for a drink or a dish…"
					value={opened ? query : (value ?? "")}
					onFocus={() => {
						setOpened(true);
						setQuery("");
					}}
					onChange={(event) => {
						setQuery(event.currentTarget.value);
						if (!opened) {
							setOpened(true);
						}
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							move(1);
						} else if (event.key === "ArrowUp") {
							event.preventDefault();
							move(-1);
						} else if (event.key === "Enter") {
							event.preventDefault();
							select(highlight);
						} else if (event.key === "Escape") {
							setOpened(false);
						}
					}}
					leftSection={<span aria-hidden>🔎</span>}
					rightSection={
						<Text size="xs" c="dimmed">
							{filtered.length}
						</Text>
					}
				/>
			</Popover.Target>

			<Popover.Dropdown p={0}>
				<Box
					ref={viewportRef}
					role="listbox"
					style={{ height: VIEWPORT, overflowY: "auto", position: "relative" }}
					onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
				>
					<Box
						style={{
							height: filtered.length * ROW_HEIGHT,
							position: "relative",
						}}
					>
						{visible.map((item, offset) => {
							const index = start + offset;
							const active = index === highlight;
							return (
								<Box
									key={item.name}
									role="option"
									aria-selected={active}
									onMouseEnter={() => setHighlight(index)}
									onMouseDown={(event) => {
										event.preventDefault();
										select(index);
									}}
									style={{
										position: "absolute",
										top: index * ROW_HEIGHT,
										left: 0,
										right: 0,
										height: ROW_HEIGHT,
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: 8,
										padding: "0 10px",
										cursor: "pointer",
										background: active
											? "var(--mantine-color-default-hover)"
											: undefined,
										fontWeight: item.name === value ? 600 : 400,
									}}
								>
									<Text size="sm" lineClamp={1}>
										{item.name}
									</Text>
									<Group gap={6} wrap="nowrap">
										<Text size="xs" c="dimmed" lineClamp={1}>
											{item.menu}
										</Text>
										<Text size="xs" c="dimmed">
											{item.count}
										</Text>
									</Group>
								</Box>
							);
						})}
					</Box>
				</Box>
				<Box
					px="sm"
					py={4}
					style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
				>
					<Text size="xs" c="dimmed">
						{filtered.length} items
						{query ? " match" : ""} · type to filter
					</Text>
				</Box>
			</Popover.Dropdown>
		</Popover>
	);
};
