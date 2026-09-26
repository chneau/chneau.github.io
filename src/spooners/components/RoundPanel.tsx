import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Card,
	Divider,
	Group,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { BasketItem, BasketVenue } from "../basket";
import { amount, currencySymbol, miles, money } from "../price";
import type { ItemInfo } from "../types";
import { ItemPicker } from "./ItemPicker";

type Props = {
	items: ItemInfo[];
	basket: BasketItem[];
	venues: BasketVenue[];
	currency: string;
	focused: number | null;
	onAdd: (name: string) => void;
	onQty: (name: string, qty: number) => void;
	onRemove: (name: string) => void;
	onClear: () => void;
	onSelect: (venue: BasketVenue) => void;
	count: number;
};

const Stepper = ({
	name,
	qty,
	onQty,
	onRemove,
}: {
	name: string;
	qty: number;
	onQty: (name: string, qty: number) => void;
	onRemove: (name: string) => void;
}) => (
	<Group justify="space-between" gap={6} wrap="nowrap">
		<Text size="sm" lineClamp={1} style={{ flex: 1 }}>
			{name}
		</Text>
		<Group gap={4} wrap="nowrap">
			<ActionIcon
				size="sm"
				variant="default"
				aria-label={`One fewer ${name}`}
				onClick={() => onQty(name, qty - 1)}
			>
				<Minus size={12} />
			</ActionIcon>
			<Text size="sm" fw={700} w={22} ta="center">
				{qty}
			</Text>
			<ActionIcon
				size="sm"
				variant="default"
				aria-label={`One more ${name}`}
				onClick={() => onQty(name, qty + 1)}
			>
				<Plus size={12} />
			</ActionIcon>
			<ActionIcon
				size="sm"
				variant="subtle"
				color="red"
				aria-label={`Remove ${name}`}
				onClick={() => onRemove(name)}
			>
				<Trash2 size={12} />
			</ActionIcon>
		</Group>
	</Group>
);

/** Build a round and see what it costs at every pub. */
export const RoundPanel = ({
	items,
	basket,
	venues,
	currency,
	focused,
	onAdd,
	onQty,
	onRemove,
	onClear,
	onSelect,
	count,
}: Props) => {
	const sorted = [...venues].sort(
		(a, b) => a.missing.length - b.missing.length || a.total - b.total,
	);
	const rows = sorted.slice(0, count);
	const totalUnits = basket.reduce((sum, item) => sum + item.qty, 0);
	const complete = sorted.filter((venue) => !venue.missing.length);

	return (
		<Card withBorder padding="sm" radius="md">
			<Group justify="space-between" mb={6}>
				<Text size="xs" c="dimmed" fw={700} tt="uppercase">
					Round calculator
				</Text>
				{basket.length ? (
					<Button
						size="compact-xs"
						variant="subtle"
						color="red"
						onClick={onClear}
					>
						Clear
					</Button>
				) : null}
			</Group>

			<Stack gap={4}>
				{basket.map((item) => (
					<Stepper
						key={item.name}
						name={item.name}
						qty={item.qty}
						onQty={onQty}
						onRemove={onRemove}
					/>
				))}
			</Stack>

			<Box mt="xs">
				<ItemPicker
					label="Add a drink or a dish"
					items={items}
					value={null}
					onChange={onAdd}
				/>
			</Box>

			{basket.length ? (
				<>
					<Divider my="sm" />
					<Group justify="space-between">
						<Text size="xs" c="dimmed">
							{totalUnits} {totalUnits === 1 ? "item" : "items"} ·{" "}
							{complete.length} pubs sell the lot
						</Text>
						{complete.length ? (
							<Badge variant="light" color="teal">
								cheapest {money(complete[0]?.total ?? 0, currency)}
							</Badge>
						) : null}
					</Group>
					<Stack gap={2} mt="xs">
						{rows.map((venue, index) => {
							const active = focused === venue.ref;
							return (
								<UnstyledButton
									key={venue.ref}
									onClick={() => onSelect(venue)}
									style={{
										display: "block",
										width: "100%",
										padding: "6px 8px",
										borderRadius: 6,
										background: active
											? "var(--mantine-color-default-hover)"
											: undefined,
									}}
								>
									<Group justify="space-between" gap={8} wrap="nowrap">
										<Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
											<Text size="xs" c="dimmed" w={16} ta="right">
												{index + 1}
											</Text>
											<Box style={{ minWidth: 0 }}>
												<Text size="sm" lineClamp={1}>
													{venue.isOpenNow ? "" : "🔴 "}
													{venue.name}
												</Text>
												<Text size="xs" c="dimmed" lineClamp={1}>
													{[venue.town, venue.postcode]
														.filter(Boolean)
														.join(", ")}
													{venue.distance != null
														? ` · ${miles(venue.distance)}`
														: ""}
													{venue.missing.length
														? ` · missing ${venue.missing.join(", ")}`
														: ""}
												</Text>
											</Box>
										</Group>
										<Group gap={3} wrap="nowrap" align="baseline">
											{venue.missing.length ? (
												<Badge size="xs" variant="light" color="orange">
													partial
												</Badge>
											) : null}
											<Text size="xs" fw={600}>
												{currencySymbol(currency)}
											</Text>
											<Text size="sm" fw={700}>
												{amount(venue.total, currency)}
											</Text>
										</Group>
									</Group>
								</UnstyledButton>
							);
						})}
					</Stack>
				</>
			) : (
				<Text size="xs" c="dimmed" mt="xs">
					Add drinks to compare the price of the whole round across pubs.
				</Text>
			)}
		</Card>
	);
};
