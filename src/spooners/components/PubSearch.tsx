import { Box, Group, InputBase, Popover, Text } from "@mantine/core";
import { Beer } from "lucide-react";
import { useMemo, useState } from "react";
import type { VenueInfo } from "../types";

type Props = {
	venues: VenueInfo[];
	onSelect: (ref: number) => void;
	label?: string;
};

/** Search pubs by name, town or postcode, and open their page. */
export const PubSearch = ({ venues, onSelect, label }: Props) => {
	const [opened, setOpened] = useState(false);
	const [query, setQuery] = useState("");

	const results = useMemo(() => {
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
		return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
	}, [venues, query]);

	const select = (ref: number) => {
		onSelect(ref);
		setOpened(false);
		setQuery("");
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
					value={opened ? query : ""}
					leftSection={<Beer size={14} />}
					rightSection={
						<Text size="xs" c="dimmed">
							{results.length}
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
						if (event.key === "Enter" && results[0]) {
							select(results[0].venueRef);
						} else if (event.key === "Escape") {
							setOpened(false);
						}
					}}
				/>
			</Popover.Target>
			<Popover.Dropdown p={0}>
				<Box style={{ maxHeight: 300, overflowY: "auto" }}>
					{results.map((venue) => (
						<Box
							key={venue.venueRef}
							role="option"
							aria-selected={false}
							onMouseDown={(event) => {
								event.preventDefault();
								select(venue.venueRef);
							}}
							style={{ padding: "6px 10px", cursor: "pointer" }}
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
					))}
					{results.length ? null : (
						<Text size="xs" c="dimmed" p="sm">
							No pub matched that.
						</Text>
					)}
				</Box>
			</Popover.Dropdown>
		</Popover>
	);
};
