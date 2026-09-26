import {
	Badge,
	Box,
	Button,
	Collapse,
	Group,
	Stack,
	Text,
} from "@mantine/core";
import { useState } from "react";
import {
	ageLabel,
	aleColour,
	allergens,
	dietary,
	heatLevel,
	linkedNames,
	optionDiscount,
	optionGroups,
	promos,
	rawKeywords,
} from "../itemFacts";
import { amount, currencySymbol } from "../price";
import type { ItemDefinition, ItemOption } from "../types";

const OptionRow = ({ option }: { option: ItemOption }) => {
	const was = optionDiscount(option);
	return (
		<Group justify="space-between" gap={8} wrap="nowrap">
			<Box style={{ minWidth: 0 }}>
				<Text size="xs">{option.label ?? option.name ?? "(unnamed)"}</Text>
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
				{option.price != null ? (
					<Text size="xs" fw={700}>
						{currencySymbol(option.currency ?? "GBP")}
						{amount(option.price, option.currency ?? "GBP")}
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
	/** Show the raw keyword dump (the "all the data" table). */
	showRaw?: boolean;
};

/** Everything the API keeps about one item, in readable form. */
export const ItemFacts = ({ def, showOptions, showRaw }: Props) => {
	const [rawOpen, setRawOpen] = useState(false);
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
	const raw = rawKeywords(def);

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
					<Badge size="xs" variant="light" color="orange">
						🔞 {age}
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
					<Badge size="xs" variant="light" color="red">
						{"🌶".repeat(Math.min(heat, 3))} heat {heat}
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
					<Badge key={label} size="xs" variant="light" color="red">
						⚠ {label}
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
									/>
								))}
							</Stack>
						</Box>
					))
				: null}

			{showRaw ? (
				<Box mt={2}>
					<Button
						size="compact-xs"
						variant="subtle"
						onClick={() => setRawOpen((value) => !value)}
					>
						{rawOpen
							? "Hide raw keyword data"
							: `Raw keyword data (${raw.length})`}
					</Button>
					<Collapse expanded={rawOpen}>
						<Box mt={4}>
							{raw.map((keyword, index) => (
								<Text
									// biome-ignore lint/suspicious/noArrayIndexKey: raw dump, order is stable
									key={`${keyword.type ?? "kw"}-${keyword.id ?? index}`}
									size="xs"
									c="dimmed"
									ff="monospace"
								>
									{[keyword.type, keyword.name, keyword.label, keyword.value]
										.filter((part) => part != null && part !== "")
										.join(" · ")}
									{keyword.isFlag ? " · flag" : ""}
									{keyword.isBadge ? " · badge" : ""}
									{keyword.isAddOn ? " · addon" : ""}
									{keyword.icon ? ` · icon ${keyword.icon}` : ""}
									{keyword.iconColor ? ` · colour ${keyword.iconColor}` : ""}
									{keyword.tags
										? ` · tags ${JSON.stringify(keyword.tags)}`
										: ""}
								</Text>
							))}
						</Box>
					</Collapse>
				</Box>
			) : null}
		</Stack>
	);
};
