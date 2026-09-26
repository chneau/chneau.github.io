import {
	Badge,
	Button,
	Divider,
	Group,
	Modal,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { useMemo } from "react";
import { basketVenues } from "../basket";
import { metricLabel, metricText, valueDirection } from "../portions";
import { money } from "../price";
import type { SpoonersCache, ValueKind } from "../types";
import { ItemFacts } from "./ItemFacts";
import { VenueImage } from "./VenueImage";

type Props = {
	opened: boolean;
	onClose: () => void;
	itemName: string | null;
	cache: SpoonersCache;
	onAdd: (name: string) => void;
	onOnly: (name: string) => void;
	onVenue: (ref: number) => void;
};

type Best = {
	kind: ValueKind;
	value: number;
	venueName: string;
	price: number;
	currency: string;
};

/** Everything the data knows about one item, and where it is cheapest. */
export const ItemModal = ({
	opened,
	onClose,
	itemName,
	cache,
	onAdd,
	onOnly,
	onVenue,
}: Props) => {
	const def = itemName ? (cache.items[itemName] ?? null) : null;
	const venues = useMemo(
		() =>
			opened && itemName
				? basketVenues(cache, [{ name: itemName, qty: 1 }])
				: [],
		[opened, itemName, cache],
	);

	const bestByKind = useMemo(() => {
		const best = new Map<ValueKind, Best>();
		for (const venue of venues) {
			if (!venue.metricKind || venue.metricValue == null) {
				continue;
			}
			const current = best.get(venue.metricKind);
			const better =
				!current ||
				valueDirection(venue.metricKind) * (venue.metricValue - current.value) <
					0;
			if (better) {
				best.set(venue.metricKind, {
					kind: venue.metricKind,
					value: venue.metricValue,
					venueName: venue.name,
					price: venue.price,
					currency: venue.currency,
				});
			}
		}
		return [...best.values()];
	}, [venues]);

	const cheapest = useMemo(
		() => [...venues].sort((a, b) => a.price - b.price).slice(0, 10),
		[venues],
	);

	if (!itemName) {
		return (
			<Modal opened={opened} onClose={onClose} title="Item" centered size="lg">
				<Text c="dimmed">Pick an item first.</Text>
			</Modal>
		);
	}

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title={itemName}
			centered
			size="lg"
		>
			<Stack gap="sm" style={{ maxHeight: "72vh", overflowY: "auto" }}>
				<Group gap={6} wrap="wrap">
					<Badge variant="light" color="gray">
						{def?.menu ?? "Other"}
					</Badge>
					{def?.category ? (
						<Badge variant="light" color="blue">
							{def.category}
						</Badge>
					) : null}
					{def?.itemType ? (
						<Badge variant="light" color="gray">
							{def.itemType}
						</Badge>
					) : null}
					{def?.courseId != null ? (
						<Badge variant="light" color="gray">
							course #{def.courseId}
						</Badge>
					) : null}
				</Group>

				<ItemFacts def={def} showOptions showRaw />

				{bestByKind.length ? (
					<>
						<Divider label="Best value in the country" labelPosition="left" />
						<Stack gap={2}>
							{bestByKind.map((row) => (
								<Group justify="space-between" gap={8} key={row.kind}>
									<Text size="sm">
										{metricText(
											{ kind: row.kind, value: row.value },
											row.currency,
										)}
										<Text span size="xs" c="dimmed">
											{" "}
											{metricLabel(row.kind)}
										</Text>
									</Text>
									<Text size="xs" c="dimmed">
										{money(row.price, row.currency)} at {row.venueName}
									</Text>
								</Group>
							))}
						</Stack>
					</>
				) : null}

				{cheapest.length ? (
					<>
						<Divider
							label={`Cheapest pubs (${venues.length} sell it)`}
							labelPosition="left"
						/>
						<Stack gap={2}>
							{cheapest.map((venue) => (
								<UnstyledButton
									key={venue.ref}
									onClick={() => onVenue(venue.ref)}
									style={{ padding: "4px 0" }}
								>
									<Group justify="space-between" gap={8} wrap="nowrap">
										<Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
											<VenueImage
												src={venue.images[0]}
												alt={venue.name}
												width={26}
												height={26}
											/>
											<Text size="sm" lineClamp={1}>
												{venue.name}
												<Text span size="xs" c="dimmed">
													{" "}
													· {venue.town ?? venue.postcode ?? ""}
												</Text>
											</Text>
										</Group>
										<Group gap={6} wrap="nowrap">
											<Text size="xs" c="dimmed">
												{venue.portion}
											</Text>
											<Text size="sm" fw={700}>
												{money(venue.price, venue.currency)}
											</Text>
										</Group>
									</Group>
								</UnstyledButton>
							))}
						</Stack>
					</>
				) : null}

				<Group gap="xs" mt="xs">
					<Button size="xs" onClick={() => onAdd(itemName)}>
						Add one to the round
					</Button>
					<Button
						size="xs"
						variant="light"
						onClick={() => {
							onOnly(itemName);
							onClose();
						}}
					>
						Show this on its own
					</Button>
				</Group>
			</Stack>
		</Modal>
	);
};
