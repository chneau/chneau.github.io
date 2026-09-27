import {
	Box,
	Group,
	Modal,
	SegmentedControl,
	Stack,
	Text,
	TextInput,
	UnstyledButton,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { type ValueLeader, valueLeaders } from "../derive";
import { valueDirection } from "../portions";
import type { Formatter, SpoonersCache, ValueKind } from "../types";

type Props = {
	opened: boolean;
	onClose: () => void;
	cache: SpoonersCache;
	onItem: (name: string) => void;
	onVenue: (ref: number) => void;
	format: Formatter;
};

const TABS: { label: string; value: ValueKind }[] = [
	{ label: "£ per unit", value: "unit" },
	{ label: "£ per 100 ml", value: "volume" },
	{ label: "kcal per £", value: "calorie" },
];

const LIMIT = 60;

/** Cross-item value leaderboards: cheapest alcohol, cheapest ml, most food. */
export const ValueExplorer = ({
	opened,
	onClose,
	cache,
	onItem,
	onVenue,
	format,
}: Props) => {
	const [tab, setTab] = useState<ValueKind>("unit");
	const [query, setQuery] = useState("");

	// only paid for once the explorer is opened
	const leaders = useMemo(
		() => (opened ? valueLeaders(cache) : []),
		[opened, cache],
	);

	const rows = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const wanted: ValueLeader[] = leaders.filter(
			(row) =>
				row.kind === tab &&
				(!needle ||
					row.name.toLowerCase().includes(needle) ||
					(row.menu ?? "").toLowerCase().includes(needle) ||
					(row.category ?? "").toLowerCase().includes(needle)),
		);
		const dir = valueDirection(tab);
		wanted.sort((a, b) => dir * (a.value - b.value));
		return wanted.slice(0, LIMIT);
	}, [leaders, tab, query]);

	const anyKind = leaders.length > 0;

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title="Best value in the country"
			centered
			size="lg"
		>
			<Stack gap="sm">
				<Text size="xs" c="dimmed">
					Every item ranked on its own, using each item's usual portion. The
					venue shown is the cheapest one selling it.
				</Text>
				<SegmentedControl
					fullWidth
					value={tab}
					data={TABS.map((item) => ({ label: item.label, value: item.value }))}
					onChange={(value) => setTab(value as ValueKind)}
				/>
				<TextInput
					size="xs"
					placeholder="Filter items…"
					value={query}
					onChange={(event) => setQuery(event.currentTarget.value)}
					rightSection={
						<Text size="xs" c="dimmed">
							{rows.length}
						</Text>
					}
				/>
				<Box style={{ maxHeight: "58vh", overflowY: "auto" }}>
					{rows.map((row, index) => (
						<UnstyledButton
							key={`${row.name}-${row.venueRef}`}
							onClick={() => onItem(row.name)}
							style={{ display: "block", width: "100%", padding: "6px 4px" }}
						>
							<Group justify="space-between" gap={8} wrap="nowrap">
								<Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
									<Text size="xs" c="dimmed" w={22} ta="right">
										{index + 1}
									</Text>
									<Box style={{ minWidth: 0 }}>
										<Text size="sm" lineClamp={1}>
											{row.name}
										</Text>
										<Text size="xs" c="dimmed" lineClamp={1}>
											{[row.menu, row.category].filter(Boolean).join(" · ")}
											{row.count > 1 ? ` · ${row.count} pubs` : ""}
										</Text>
									</Box>
								</Group>
								<Box style={{ textAlign: "right", flexShrink: 0 }}>
									<Text size="sm" fw={700}>
										{format.metric(row.kind, row.value, row.currency)}
									</Text>
									<Text
										size="xs"
										c="dimmed"
										onClick={(event) => {
											event.stopPropagation();
											onVenue(row.venueRef);
										}}
									>
										{row.portion} {format.money(row.price, row.currency)} ·{" "}
										{row.venueName}
									</Text>
								</Box>
							</Group>
						</UnstyledButton>
					))}
					{rows.length ? null : (
						<Text size="sm" c="dimmed">
							{anyKind
								? "Nothing matched that filter."
								: "No value data available."}
						</Text>
					)}
				</Box>
			</Stack>
		</Modal>
	);
};
