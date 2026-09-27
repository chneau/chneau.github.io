import { Badge, Box, Group, Stack, Text } from "@mantine/core";
import { Flame, TriangleAlert } from "lucide-react";
import {
	ageLabel,
	aleColour,
	allergens,
	dietary,
	heatLevel,
	humanise,
	linkedNames,
	optionDiscount,
	optionGroups,
	promos,
} from "../itemFacts";
import type { Formatter, ItemDefinition, ItemOption } from "../types";

const OptionRow = ({
	option,
	format,
}: {
	option: ItemOption;
	format: Formatter;
}) => {
	const was = optionDiscount(option);
	const price = option.price;
	const currency = option.currency ?? "GBP";
	const moneyText = price == null ? null : format.money(price, currency);
	return (
		<Group justify="space-between" gap={8} wrap="nowrap">
			<Box style={{ minWidth: 0 }}>
				<Text size="xs">
					{humanise(option.label ?? option.name ?? "(unnamed)")}
				</Text>
				{option.description ? (
					<Text size="xs" c="dimmed" lineClamp={2}>
						{option.description}
					</Text>
				) : null}
			</Box>
			<Group gap={6} wrap="nowrap">
				{option.calories ? (
					<Text size="xs" c="dimmed">
						{option.calories} kcal
					</Text>
				) : null}
				{was ? (
					<Text size="xs" c="red">
						{was}
					</Text>
				) : null}
				{moneyText != null ? (
					<Text size="xs" fw={700}>
						{moneyText}
					</Text>
				) : (
					<Text size="xs" c="dimmed">
						no charge
					</Text>
				)}
			</Group>
		</Group>
	);
};

type Props = {
	def: ItemDefinition | null;
	/** Show the add-ons / swaps / tags with their prices. */
	showOptions?: boolean;
	/** Currency conversion for the option prices. */
	format: Formatter;
};

/** Everything the API keeps about one item, in readable form. */
export const ItemFacts = ({ def, showOptions, format }: Props) => {
	if (!def) {
		return null;
	}
	const extras = dietary(def);
	const allergenList = allergens(def);
	const ale = aleColour(def);
	const heat = heatLevel(def);
	const promosHere = promos(def);
	const linked = linkedNames(def);
	const age = ageLabel(def);
	const groups = optionGroups(def).filter(
		(group) => showOptions || group.group === "portion",
	);

	return (
		<Stack gap={6}>
			{def.description ? (
				<Text size="sm" c="dimmed">
					{def.description}
				</Text>
			) : null}
			<Group gap={4} wrap="wrap">
				{def.calories ? (
					<Badge size="xs" variant="light" color="gray">
						{def.calories} kcal
					</Badge>
				) : null}
				{age ? (
					<Badge
						size="xs"
						variant="light"
						color="orange"
						leftSection={<TriangleAlert size={11} />}
					>
						{age}
					</Badge>
				) : null}
				{extras.map((label) => (
					<Badge key={label} size="xs" variant="light" color="teal">
						{label}
					</Badge>
				))}
				{ale ? (
					<Badge size="xs" variant="light" color="brown">
						{ale}
					</Badge>
				) : null}
				{heat ? (
					<Badge
						size="xs"
						variant="light"
						color="red"
						leftSection={<Flame size={11} />}
					>
						heat {heat}
					</Badge>
				) : null}
				{promosHere.map((label) => (
					<Badge key={label} size="xs" variant="light" color="grape">
						{label}
					</Badge>
				))}
				{linked.map((label) => (
					<Badge key={label} size="xs" variant="light" color="blue">
						{label}
					</Badge>
				))}
				{allergenList.map((label) => (
					<Badge
						key={label}
						size="xs"
						variant="light"
						color="red"
						leftSection={<TriangleAlert size={11} />}
					>
						{label}
					</Badge>
				))}
			</Group>

			{showOptions
				? groups.map((group) => (
						<Box key={group.group}>
							<Text size="xs" c="dimmed" fw={700} tt="uppercase" mt={4}>
								{group.label}
							</Text>
							<Stack gap={2}>
								{group.options.map((option, index) => (
									<OptionRow
										key={`${group.group}-${option.id ?? index}`}
										option={option}
										format={format}
									/>
								))}
							</Stack>
						</Box>
					))
				: null}
		</Stack>
	);
};
