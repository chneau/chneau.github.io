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
import { EmptyState } from "../../shared";
import { type ValueLeader, valueLeaders } from "../derive";
import { valueDirection } from "../portions";
import { currencySymbol } from "../price";
import type { Formatter, SpoonersCache, ValueKind } from "../types";

type Props = {
	opened: boolean;
	onClose: () => void;
	cache: SpoonersCache;
	onItem: (name: string) => void;
	onVenue: (ref: number) => void;
	format: Formatter;
};

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
		() =>
			opened
				? valueLeaders(
						cache,
						format.targetCurrency
							? {
									metric: format.convertMetric,
									money: format.convertMoney,
									currency: format.targetCurrency,
								}
							: undefined,
					)
				: [],
		[opened, cache, format],
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
		// When prices are not converted, keep each currency's ranking together
		// so £ and € values are never interleaved by their raw numbers.
		wanted.sort(
			(a, b) =>
				(format.targetCurrency ? 0 : a.currency.localeCompare(b.currency)) ||
				dir * (a.value - b.value),
		);
		return wanted.slice(0, LIMIT);
	}, [leaders, tab, query, format.targetCurrency]);

	const anyKind = leaders.length > 0;
	// Label the value metric in whatever currency is being shown; when native
	// prices are mixed the symbol is left neutral.
	const symbol = format.targetCurrency
		? currencySymbol(format.targetCurrency)
		: "currency";
	const tabs: { label: string; value: ValueKind }[] = [
		{ label: `${symbol} per unit`, value: "unit" },
		{ label: `${symbol} per 100 ml`, value: "volume" },
		{ label: `kcal per ${symbol}`, value: "calorie" },
	];

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
					{format.targetCurrency
						? ` All prices are converted to ${format.targetCurrency}.`
						: " Each currency is ranked separately."}
				</Text>
				<SegmentedControl
					fullWidth
					value={tab}
					data={tabs.map((item) => ({ label: item.label, value: item.value }))}
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
						<Box
							key={`${row.name}-${row.venueRef}`}
							style={{ display: "block", width: "100%", padding: "6px 4px" }}
						>
							<Group justify="space-between" gap={8} wrap="nowrap">
								<UnstyledButton
									onClick={() => onItem(row.name)}
									style={{ flex: 1, minWidth: 0, textAlign: "left" }}
								>
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
												{format.targetCurrency ? "" : ` · ${row.currency}`}
											</Text>
										</Box>
									</Group>
								</UnstyledButton>
								<Box style={{ textAlign: "right", flexShrink: 0 }}>
									<Text size="sm" fw={700}>
										{format.metric(row.kind, row.value, row.currency)}
									</Text>
									<UnstyledButton onClick={() => onVenue(row.venueRef)}>
										<Text size="xs" c="dimmed">
											{row.portion} {format.money(row.price, row.currency)} ·{" "}
											{row.venueName}
										</Text>
									</UnstyledButton>
								</Box>
							</Group>
						</Box>
					))}
					{rows.length ? null : anyKind ? (
						<EmptyState
							title="Nothing matched that filter"
							body="Try a different search or another value tab."
						/>
					) : (
						<EmptyState
							title="No value data available"
							body="The dataset does not include enough nutrition or volume data for this yet."
						/>
					)}
				</Box>
			</Stack>
		</Modal>
	);
};
