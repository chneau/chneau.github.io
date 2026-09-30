import { Box, Group, InputBase, Popover, Text } from "@mantine/core";
import { Beer } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { VenueInfo } from "../types";

type Props = {
	venues: VenueInfo[];
	onSelect: (ref: number) => void;
	label?: string;
};

const LIMIT = 60;

/** Search pubs by name, town or postcode, and open their page. */
export const PubSearch = ({ venues, onSelect, label }: Props) => {
	const [opened, setOpened] = useState(false);
	const [query, setQuery] = useState("");
	const [highlight, setHighlight] = useState(0);
	const viewportRef = useRef<HTMLDivElement>(null);
	const listboxId = useId();
	const optionId = (index: number) => `${listboxId}-option-${index}`;

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const list = needle
			? venues.filter((venue) =>
					[
						venue.name,
						venue.address?.town,
						venue.address?.postcode,
						venue.address?.county,
					].some((field) => field?.toLowerCase().includes(needle)),
				)
			: venues;
		return [...list].sort((a, b) => a.name.localeCompare(b.name));
	}, [venues, query]);

	const results = filtered.slice(0, LIMIT);
	const truncated = filtered.length > results.length;

	// reset the highlight whenever the result set changes
	useEffect(() => {
		setHighlight(0);
		if (viewportRef.current) {
			viewportRef.current.scrollTop = 0;
		}
	}, [query]);

	// keep the highlighted row in view as the user arrows through
	useEffect(() => {
		viewportRef.current
			?.querySelector(`[data-index="${highlight}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [highlight]);

	const select = (index: number) => {
		const venue = results[index];
		if (!venue) {
			return;
		}
		onSelect(venue.venueRef);
		setOpened(false);
		setQuery("");
	};

	const move = (delta: number) => {
		if (!results.length) {
			return;
		}
		setHighlight((current) =>
			Math.min(Math.max(current + delta, 0), results.length - 1),
		);
	};

	return (
		<Popover
			opened={opened}
			onChange={setOpened}
			position="bottom-start"
			width="target"
			withinPortal
			shadow="md"
		>
			<Popover.Target>
				<InputBase
					label={label}
					placeholder="Find a pub by name or town…"
					role="combobox"
					aria-expanded={opened}
					aria-controls={opened ? listboxId : undefined}
					aria-autocomplete="list"
					aria-activedescendant={
						opened && results[highlight] ? optionId(highlight) : undefined
					}
					value={opened ? query : ""}
					leftSection={<Beer size={14} />}
					rightSection={
						<Text size="xs" c="dimmed">
							{truncated
								? `${results.length}/${filtered.length}`
								: results.length}
						</Text>
					}
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
				/>
			</Popover.Target>
			<Popover.Dropdown p={0}>
				<Box
					ref={viewportRef}
					id={listboxId}
					role="listbox"
					style={{ maxHeight: 300, overflowY: "auto" }}
				>
					{results.map((venue, index) => {
						const active = index === highlight;
						return (
							<Box
								key={venue.venueRef}
								id={optionId(index)}
								data-index={index}
								role="option"
								aria-selected={active}
								onMouseEnter={() => setHighlight(index)}
								onMouseDown={(event) => {
									event.preventDefault();
									select(index);
								}}
								style={{
									padding: "6px 10px",
									cursor: "pointer",
									background: active
										? "var(--mantine-color-default-hover)"
										: undefined,
								}}
							>
								<Group justify="space-between" gap={8} wrap="nowrap">
									<Text size="sm" lineClamp={1}>
										{venue.name}
									</Text>
									<Text size="xs" c="dimmed" lineClamp={1}>
										{[venue.address?.town, venue.address?.postcode]
											.filter(Boolean)
											.join(", ")}
									</Text>
								</Group>
							</Box>
						);
					})}
					{results.length ? null : (
						<Text size="xs" c="dimmed" p="sm">
							No pub matched that.
						</Text>
					)}
				</Box>
				{results.length ? (
					<Box
						px="sm"
						py={4}
						style={{
							borderTop: "1px solid var(--mantine-color-default-border)",
						}}
					>
						<Text size="xs" c="dimmed">
							{truncated
								? `Showing ${results.length} of ${filtered.length} — keep typing to narrow`
								: `${filtered.length} ${
										filtered.length === 1 ? "pub" : "pubs"
									}`}
						</Text>
					</Box>
				) : null}
			</Popover.Dropdown>
		</Popover>
	);
};
