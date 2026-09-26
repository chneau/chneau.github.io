import {
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
import { LocateFixed } from "lucide-react";
import type { CurrencyOption, FilterOption } from "../derive";
import { type makeScale, money, priceColor } from "../price";
import type { ItemInfo } from "../types";
import { ItemPicker } from "./ItemPicker";

type Props = {
	items: ItemInfo[];
	value: string | null;
	onSelect: (name: string) => void;
	item: ItemInfo | null;
	badges: string[];
	portions: string[];
	portion: string | null;
	onPortion: (portion: string) => void;
	currencies: CurrencyOption[];
	currency: string;
	onCurrency: (currency: string) => void;
	filters: FilterOption[];
	activeFilters: string[];
	onFilters: (ids: string[]) => void;
	openNow: boolean;
	onOpenNow: (value: boolean) => void;
	openCount: number;
	hideSpecial: boolean;
	onHideSpecial: (value: boolean) => void;
	specialCount: number;
	hasLocation: boolean;
	geoState: "idle" | "loading" | "error";
	onNearMe: () => void;
	scale: ReturnType<typeof makeScale>;
	/** Set when prices are being converted into another currency. */
	converted: { currency: string; rateDate: string | null } | null;
};

const Legend = ({
	scale,
	currency,
}: {
	scale: ReturnType<typeof makeScale>;
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

export const ItemSearchCard = ({
	items,
	value,
	onSelect,
	item,
	badges,
	portions,
	portion,
	onPortion,
	currencies,
	currency,
	onCurrency,
	filters,
	activeFilters,
	onFilters,
	openNow,
	onOpenNow,
	openCount,
	hideSpecial,
	onHideSpecial,
	specialCount,
	hasLocation,
	geoState,
	onNearMe,
	scale,
	converted,
}: Props) => (
	<Card withBorder padding="md" radius="md">
		<Stack gap="sm">
			<ItemPicker
				label="Item"
				items={items}
				value={value}
				onChange={onSelect}
			/>

			{item ? (
				<Box>
					<Group gap={6} align="baseline">
						<Text size="sm" fw={600}>
							{item.category ?? "Item"}
						</Text>
						<Text size="xs" c="dimmed">
							{item.menu}
						</Text>
						{item.calories ? (
							<Text size="xs" c="dimmed">
								· {item.calories} kcal
							</Text>
						) : null}
					</Group>
					{item.description ? (
						<Text size="xs" c="dimmed">
							{item.description}
						</Text>
					) : null}
					{badges.length ? (
						<Group gap={4} mt={6}>
							{badges.map((badge) => (
								<Badge key={badge} size="xs" variant="light" color="teal">
									{badge}
								</Badge>
							))}
						</Group>
					) : null}
				</Box>
			) : null}

			{portions.length > 1 ? (
				<Box>
					<Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
						Portion
					</Text>
					<SegmentedControl
						size="xs"
						fullWidth
						value={portion ?? undefined}
						data={portions.map((label) => ({ label, value: label }))}
						onChange={onPortion}
					/>
				</Box>
			) : null}

			{currencies.length > 1 ? (
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
			</Group>
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

			<Legend scale={scale} currency={currency} />
			{converted ? (
				<Text size="xs" c="dimmed">
					converted to {converted.currency}
					{converted.rateDate ? ` at ${converted.rateDate} ECB rates` : ""}
				</Text>
			) : null}
		</Stack>
	</Card>
);
