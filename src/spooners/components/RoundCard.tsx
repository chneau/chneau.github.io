import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Card,
	Chip,
	Collapse,
	Group,
	SegmentedControl,
	Stack,
	Switch,
	Text,
	Tooltip,
	UnstyledButton,
} from "@mantine/core";
import {
	ChevronDown,
	CircleHelp,
	LocateFixed,
	Minus,
	Plus,
	RotateCcw,
	SlidersHorizontal,
	Trash2,
} from "lucide-react";
import { useState } from "react";
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
	/** Set right after a clear, so the round can be restored. */
	onUndo?: (() => void) | null;
	currencies?: CurrencyOption[];
	currency?: string;
	onCurrency?: (currency: string) => void;
	filters: FilterOption[];
	activeFilters: string[];
	onFilters: (ids: string[]) => void;
	/** False when none of the round's items carry a dietary tag. */
	dietaryRelevant: boolean;
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
	completeCount: number;
	partialCount: number;
	onlyComplete: boolean;
	onOnlyComplete: (value: boolean) => void;
	hasLocation: boolean;
	geoState: "idle" | "loading" | "error";
	onNearMe: () => void;
	onClearLocation: () => void;
	scale: PriceScale;
	metric: string | null;
	trend: Trend | null;
	converted: { currency: string; rateDate: string | null } | null;
};

const Hint = ({ label }: { label: string }) => (
	<Tooltip label={label} withArrow multiline w={220}>
		<ActionIcon
			size="xs"
			variant="subtle"
			color="gray"
			aria-label={label}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		>
			<CircleHelp size={13} />
		</ActionIcon>
	</Tooltip>
);

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
		<Text size="sm" lineClamp={1} style={{ flex: 1 }} title={name}>
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
	onUndo,
	currencies,
	currency,
	onCurrency,
	filters,
	activeFilters,
	onFilters,
	dietaryRelevant,
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
	onClearLocation,
	scale,
	metric,
	trend,
	converted,
}: Props) => {
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [open, setOpen] = useState(true);
	const totalQty = basket.reduce((sum, item) => sum + item.qty, 0);
	const single =
		basket.length === 1
			? items.find((item) => item.name === basket[0]?.name)
			: null;
	const activeFilterCount =
		activeFilters.length + activeFacilities.length + (openNow ? 1 : 0);

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between" gap="xs" wrap="nowrap">
					<Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
						<UnstyledButton
							onClick={() => setOpen((value) => !value)}
							aria-expanded={open}
						>
							<Group gap={6} wrap="nowrap">
								<ChevronDown
									size={14}
									style={{
										transform: open ? undefined : "rotate(-90deg)",
										transition: "transform 150ms",
										flexShrink: 0,
									}}
								/>
								<Text size="xs" c="dimmed" fw={700} tt="uppercase">
									Round
								</Text>
							</Group>
						</UnstyledButton>
						<Hint label="Pick what you're ordering. Every pub is priced for the whole round, so you compare like for like." />
					</Group>
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

				<Collapse expanded={open}>
					{onUndo ? (
						<Group
							justify="space-between"
							gap="xs"
							p="xs"
							style={{
								borderRadius: 6,
								background: "var(--mantine-color-default-hover)",
							}}
						>
							<Text size="xs">Round cleared</Text>
							<Button
								size="compact-xs"
								variant="light"
								leftSection={<RotateCcw size={12} />}
								onClick={onUndo}
							>
								Undo
							</Button>
						</Group>
					) : null}

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
									<Group gap={2} align="center">
										<Text size="xs" c="teal" fw={600}>
											{metric}
										</Text>
										<Hint label="Value: price per alcohol unit, per 100 ml, or calories per pound. The Value tab ranks by it." />
									</Group>
								) : null}
							</Group>
							{single.description ? (
								<Text size="xs" c="dimmed">
									{single.description}
								</Text>
							) : null}
							{trend ? (
								<Group gap={8} mt={6} align="center">
									<Sparkline
										points={trend.points.map((point) => point.median)}
									/>
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

					<Button
						variant="default"
						size="sm"
						fullWidth
						justify="space-between"
						leftSection={<SlidersHorizontal size={14} />}
						rightSection={
							<Group gap={6}>
								{activeFilterCount ? (
									<Badge size="xs" variant="filled" color="teal">
										{activeFilterCount}
									</Badge>
								) : null}
								<ChevronDown
									size={14}
									style={{
										transform: filtersOpen ? "rotate(180deg)" : undefined,
										transition: "transform 150ms",
									}}
								/>
							</Group>
						}
						onClick={() => setFiltersOpen((open) => !open)}
					>
						Filters
					</Button>

					<Collapse expanded={filtersOpen}>
						<Stack gap="sm">
							{dietaryRelevant && filters.length ? (
								<Box>
									<Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
										Dietary
									</Text>
									<Chip.Group
										multiple
										value={activeFilters}
										onChange={onFilters}
									>
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
												<Chip
													key={facility.label}
													size="xs"
													value={facility.label}
												>
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
									onChange={(event) =>
										onHideSpecial(event.currentTarget.checked)
									}
									label={`Hide airport & travel (${specialCount})`}
								/>
								<Switch
									size="xs"
									checked={hideClosed}
									onChange={(event) =>
										onHideClosed(event.currentTarget.checked)
									}
									label={`Hide closed (${closedCount})`}
								/>
								{partialCount > 0 ? (
									<Switch
										size="xs"
										checked={onlyComplete}
										onChange={(event) =>
											onOnlyComplete(event.currentTarget.checked)
										}
										label={
											<Group gap={4} component="span">
												<span>Whole round only ({completeCount})</span>
												<Hint label="Only compare pubs that can serve every item, so a pub missing a drink does not look cheaper." />
											</Group>
										}
									/>
								) : null}
							</Group>

							{partialCount > 0 ? (
								<Text size="xs" c="dimmed">
									{completeCount
										? `${partialCount} ${
												partialCount === 1 ? "pub" : "pubs"
											} miss at least one item and are excluded while this is on.`
										: `No pub serves every item of this round — turn "Whole round only" off to see partial rounds.`}
								</Text>
							) : null}
						</Stack>
					</Collapse>

					{hasLocation ? (
						<Group gap={6}>
							<Badge variant="light" color="teal" leftSection="📍">
								Location on
							</Badge>
							<Button
								size="compact-xs"
								variant="subtle"
								onClick={onClearLocation}
							>
								Turn off
							</Button>
						</Group>
					) : (
						<Button
							size="xs"
							variant="light"
							leftSection={<LocateFixed size={14} />}
							loading={geoState === "loading"}
							onClick={onNearMe}
						>
							Near me
						</Button>
					)}
					{geoState === "error" ? (
						<Text size="xs" c="red">
							Location unavailable — check browser permissions.
						</Text>
					) : null}

					<Box mt="xs">
						<Box
							style={{
								height: 6,
								borderRadius: 999,
								background: `linear-gradient(90deg, ${priceColor(
									scale.min,
									scale,
								)}, ${priceColor(
									(scale.min + scale.max) / 2,
									scale,
								)}, ${priceColor(scale.max, scale)})`,
							}}
						/>
						<Group justify="space-between" mt={2}>
							<Text size="xs" c="dimmed">
								{money(scale.min, currency ?? "GBP")}
							</Text>
							<Text size="xs" c="dimmed">
								{money(scale.max, currency ?? "GBP")}
							</Text>
						</Group>
					</Box>
					{converted ? (
						<Text size="xs" c="dimmed">
							converted to {converted.currency}
							{converted.rateDate ? ` at ${converted.rateDate} ECB rates` : ""}
						</Text>
					) : null}
				</Collapse>
			</Stack>
		</Card>
	);
};
