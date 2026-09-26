import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Card,
	Chip,
	Group,
	SegmentedControl,
	Stack,
	Switch,
	Text,
} from "@mantine/core";
import { LocateFixed, Minus, Plus, Trash2 } from "lucide-react";
import type { BasketItem } from "../basket";
import type {
	CurrencyOption,
	FacilityOption,
	FilterOption,
	Trend,
} from "../derive";
import { money, type PriceScale, priceColor } from "../price";
import type { ItemInfo } from "../types";
import { ItemPicker } from "./ItemPicker";
import { Sparkline } from "./Sparkline";

type Props = {
	items: ItemInfo[];
	basket: BasketItem[];
	onAdd: (name: string) => void;
	onQty: (name: string, qty: number) => void;
	onRemove: (name: string) => void;
	onClear: () => void;
	/** Only used to restore the native-currency switcher. */
	currencies?: CurrencyOption[];
	currency?: string;
	onCurrency?: (currency: string) => void;
	filters: FilterOption[];
	activeFilters: string[];
	onFilters: (ids: string[]) => void;
	facilities: FacilityOption[];
	activeFacilities: string[];
	onFacilities: (labels: string[]) => void;
	openNow: boolean;
	onOpenNow: (value: boolean) => void;
	openCount: number;
	hideSpecial: boolean;
	onHideSpecial: (value: boolean) => void;
	specialCount: number;
	hideClosed: boolean;
	onHideClosed: (value: boolean) => void;
	closedCount: number;
	/** Pubs that can serve every item of the round / that miss at least one. */
	completeCount: number;
	partialCount: number;
	onlyComplete: boolean;
	onOnlyComplete: (value: boolean) => void;
	hasLocation: boolean;
	geoState: "idle" | "loading" | "error";
	onNearMe: () => void;
	scale: PriceScale;
	/** Price-formula insight for a single-drink round, e.g. "£1.63/unit". */
	metric: string | null;
	trend: Trend | null;
	/** Set when prices are being converted into another currency. */
	converted: { currency: string; rateDate: string | null } | null;
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

const Legend = ({
	scale,
	currency,
}: {
	scale: PriceScale;
	currency: string;
}) => (
	<Box mt="sm">
		<Box
			style={{
				height: 6,
				borderRadius: 999,
				background: `linear-gradient(90deg, ${priceColor(scale.min, scale)}, ${priceColor(
					(scale.min + scale.max) / 2,
					scale,
				)}, ${priceColor(scale.max, scale)})`,
			}}
		/>
		<Group justify="space-between" mt={2}>
			<Text size="xs" c="dimmed">
				{money(scale.min, currency)}
			</Text>
			<Text size="xs" c="dimmed">
				{money(scale.max, currency)}
			</Text>
		</Group>
	</Box>
);

/**
 * The round builder (and the app's only "search"): add drinks, set quantities,
 * then the map/rankings/stats all use the round total.
 */
export const RoundCard = ({
	items,
	basket,
	onAdd,
	onQty,
	onRemove,
	onClear,
	currencies,
	currency,
	onCurrency,
	filters,
	activeFilters,
	onFilters,
	facilities,
	activeFacilities,
	onFacilities,
	openNow,
	onOpenNow,
	openCount,
	hideSpecial,
	onHideSpecial,
	specialCount,
	hideClosed,
	onHideClosed,
	closedCount,
	completeCount,
	partialCount,
	onlyComplete,
	onOnlyComplete,
	hasLocation,
	geoState,
	onNearMe,
	scale,
	metric,
	trend,
	converted,
}: Props) => {
	const totalQty = basket.reduce((sum, item) => sum + item.qty, 0);
	const single =
		basket.length === 1
			? items.find((item) => item.name === basket[0]?.name)
			: null;
	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between">
					<Text size="xs" c="dimmed" fw={700} tt="uppercase">
						Round
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
					{basket.length ? null : (
						<Text size="xs" c="dimmed">
							Nothing yet - search below to build a round, or a single drink.
						</Text>
					)}
				</Stack>

				<ItemPicker
					label="Add a drink or a dish"
					items={items}
					value={null}
					onChange={onAdd}
				/>

				{single ? (
					<Box>
						<Group gap={6} align="baseline">
							<Text size="sm" fw={600}>
								{single.category ?? "Item"}
							</Text>
							<Text size="xs" c="dimmed">
								{single.menu}
							</Text>
							{single.calories ? (
								<Text size="xs" c="dimmed">
									· {single.calories} kcal
								</Text>
							) : null}
							{metric ? (
								<Text size="xs" c="teal" fw={600}>
									· {metric}
								</Text>
							) : null}
						</Group>
						{single.description ? (
							<Text size="xs" c="dimmed">
								{single.description}
							</Text>
						) : null}
						{trend ? (
							<Group gap={8} mt={6} align="center">
								<Sparkline points={trend.points.map((point) => point.median)} />
								<Text size="xs" c="dimmed">
									median {trend.percent >= 0 ? "+" : "−"}
									{Math.abs(Math.round(trend.percent))}% since{" "}
									{trend.points[0]?.t}
								</Text>
							</Group>
						) : null}
					</Box>
				) : basket.length > 1 ? (
					<Badge variant="light" color="blue">
						{totalQty} items · map shows the whole round
					</Badge>
				) : null}

				{currencies && currencies.length > 1 && currency && onCurrency ? (
					<Box>
						<Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
							Currency
						</Text>
						<SegmentedControl
							size="xs"
							fullWidth
							value={currency}
							data={currencies.map((option) => ({
								label: `${option.code} (${option.count})`,
								value: option.code,
							}))}
							onChange={onCurrency}
						/>
					</Box>
				) : null}

				{filters.length ? (
					<Box>
						<Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
							Dietary filters
						</Text>
						<Chip.Group multiple value={activeFilters} onChange={onFilters}>
							<Group gap={4}>
								{filters.map((filter) => (
									<Chip key={filter.id} size="xs" value={filter.id}>
										{filter.label} ({filter.count})
									</Chip>
								))}
							</Group>
						</Chip.Group>
					</Box>
				) : null}

				{facilities.length ? (
					<Box>
						<Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
							Pub facilities
						</Text>
						<Chip.Group
							multiple
							value={activeFacilities}
							onChange={onFacilities}
						>
							<Group gap={4}>
								{facilities.map((facility) => (
									<Chip key={facility.label} size="xs" value={facility.label}>
										{facility.label} ({facility.count})
									</Chip>
								))}
							</Group>
						</Chip.Group>
					</Box>
				) : null}

				<Group gap="md" wrap="wrap">
					<Switch
						size="xs"
						checked={openNow}
						onChange={(event) => onOpenNow(event.currentTarget.checked)}
						label={`Open now (${openCount})`}
					/>
					<Switch
						size="xs"
						checked={hideSpecial}
						onChange={(event) => onHideSpecial(event.currentTarget.checked)}
						label={`Hide airport & travel (${specialCount})`}
					/>
					<Switch
						size="xs"
						checked={hideClosed}
						onChange={(event) => onHideClosed(event.currentTarget.checked)}
						label={`Hide closed (${closedCount})`}
					/>
					{partialCount > 0 ? (
						<Switch
							size="xs"
							checked={onlyComplete}
							onChange={(event) => onOnlyComplete(event.currentTarget.checked)}
							label={`Whole round only (${completeCount})`}
						/>
					) : null}
				</Group>
				{partialCount > 0 ? (
					<Text size="xs" c="dimmed">
						{completeCount
							? `${partialCount} ${partialCount === 1 ? "pub" : "pubs"} miss at least one item and are excluded while this is on.`
							: `No pub serves every item of this round — turn "Whole round only" off to see partial rounds.`}
					</Text>
				) : null}
				<Group justify="space-between" align="center">
					<Button
						size="xs"
						variant={hasLocation ? "filled" : "light"}
						leftSection={<LocateFixed size={14} />}
						loading={geoState === "loading"}
						onClick={onNearMe}
					>
						{hasLocation ? "Location on" : "Near me"}
					</Button>
				</Group>
				{geoState === "error" ? (
					<Text size="xs" c="red">
						Location unavailable — check browser permissions.
					</Text>
				) : null}

				<Legend scale={scale} currency={currency ?? "GBP"} />
				{converted ? (
					<Text size="xs" c="dimmed">
						converted to {converted.currency}
						{converted.rateDate ? ` at ${converted.rateDate} ECB rates` : ""}
					</Text>
				) : null}
			</Stack>
		</Card>
	);
};
