import {
	Badge,
	Box,
	Divider,
	Group,
	Modal,
	Stack,
	Text,
	TextInput,
	UnstyledButton,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { SPOT_META, venueSpot } from "../derive";
import { portionLabel, portionRank } from "../portions";
import { amount, currencySymbol } from "../price";
import type { SpoonersCache } from "../types";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<string, string> = {
	mon: "Monday",
	tue: "Tuesday",
	wed: "Wednesday",
	thu: "Thursday",
	fri: "Friday",
	sat: "Saturday",
	sun: "Sunday",
};

type MenuRow = {
	name: string;
	menu: string;
	category: string;
	description: string | null;
	calories: number | null;
	badges: string[];
	portions: [string, number][];
};

type Props = {
	opened: boolean;
	onClose: () => void;
	venueRef: number | null;
	cache: SpoonersCache;
	onSelectItem: (name: string) => void;
};

/** Everything known about one pub: address, hours, facilities and full menu. */
export const VenueModal = ({
	opened,
	onClose,
	venueRef,
	cache,
	onSelectItem,
}: Props) => {
	const [query, setQuery] = useState("");
	const entry = venueRef != null ? cache.venues[String(venueRef)] : undefined;

	const rows = useMemo<MenuRow[]>(() => {
		if (!entry) {
			return [];
		}
		const out: MenuRow[] = [];
		for (const [name, portions] of Object.entries(entry.items)) {
			const definition = cache.items[name];
			out.push({
				name,
				menu: definition?.menu ?? "Other",
				category: definition?.category ?? "",
				description: definition?.description ?? null,
				calories: definition?.calories ?? null,
				badges: (definition?.keywords ?? [])
					.filter((keyword) => keyword.isFlag || keyword.isBadge)
					.map((keyword) => keyword.label ?? keyword.name ?? "")
					.filter(Boolean),
				portions: Object.entries(portions).sort(
					(a, b) =>
						portionRank(a[0]) - portionRank(b[0]) || a[0].localeCompare(b[0]),
				),
			});
		}
		return out.sort(
			(a, b) =>
				a.menu.localeCompare(b.menu) ||
				a.category.localeCompare(b.category) ||
				a.name.localeCompare(b.name),
		);
	}, [entry, cache.items]);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) {
			return rows;
		}
		return rows.filter(
			(row) =>
				row.name.toLowerCase().includes(needle) ||
				row.category.toLowerCase().includes(needle) ||
				row.menu.toLowerCase().includes(needle),
		);
	}, [rows, query]);

	if (!entry) {
		return (
			<Modal opened={opened} onClose={onClose} title="Pub" centered size="lg">
				<Text c="dimmed">No data for this pub.</Text>
			</Modal>
		);
	}

	const { venue, detail } = entry;
	const currency =
		detail?.currency?.code ?? detail?.currency?.currencyCode ?? "GBP";
	const spot = venueSpot(venue, detail);
	const days = detail?.openingTimes?.days ?? {};
	const contact = detail?.contactDetails as
		| { email?: string; telephone?: string; website?: string }
		| undefined;
	const payments = Object.values(detail?.paymentConfig?.methods ?? {})
		.filter((method) => method.enabled)
		.map((method) => method.label ?? method.name ?? "")
		.filter(Boolean);
	const address = venue.address;
	const temporarilyClosed =
		venue.status === "closing_temporary" ||
		venue.status === "closed_temporary" ||
		venue.status === "opening_soon";

	// keep menu order stable but grouped for display
	let lastGroup = "";

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title={venue.name}
			centered
			size="lg"
		>
			<Stack gap="xs" style={{ maxHeight: "72vh", overflowY: "auto" }}>
				<Group gap={6} wrap="wrap">
					{spot !== "high-street" ? (
						<Badge variant="light" color="grape">
							{SPOT_META[spot].emoji} {SPOT_META[spot].label}
						</Badge>
					) : null}
					{temporarilyClosed ? (
						<Badge variant="light" color="red">
							⛔ {venue.status?.replace("_", " ")}
						</Badge>
					) : null}
					{venue.selectHandler?.type === "message" ? (
						<Badge variant="light" color="orange">
							no ordering
						</Badge>
					) : null}
					<Badge variant="light" color="gray">
						{currency}
					</Badge>
				</Group>

				<Text size="sm">
					{[
						address?.line1,
						address?.line2,
						address?.town,
						address?.county,
						address?.postcode,
					]
						.filter(Boolean)
						.join(", ")}
				</Text>

				<Group gap="md" wrap="wrap">
					{contact?.telephone ? (
						<Text size="sm">
							📞{" "}
							<a href={`tel:${contact.telephone.replace(/\s/g, "")}`}>
								{contact.telephone}
							</a>
						</Text>
					) : null}
					{contact?.email ? (
						<Text size="sm">
							✉️ <a href={`mailto:${contact.email}`}>{contact.email}</a>
						</Text>
					) : null}
					{contact?.website ? (
						<Text size="sm">
							🌐{" "}
							<a href={contact.website} target="_blank" rel="noreferrer">
								website
							</a>
						</Text>
					) : null}
				</Group>

				<Divider label="Opening hours" labelPosition="left" />
				<Group gap="xl" wrap="wrap">
					<Stack gap={0}>
						{DAY_ORDER.map((key) => {
							const day = days[key];
							return (
								<Text size="xs" key={key}>
									<strong>{DAY_LABEL[key]}</strong>{" "}
									{day?.open ? `${day.open}–${day.close ?? ""}` : "closed"}
								</Text>
							);
						})}
					</Stack>
					{detail?.facilities?.length ? (
						<Stack gap={2} style={{ flex: 1, minWidth: 180 }}>
							<Text size="xs" c="dimmed" fw={700} tt="uppercase">
								Facilities
							</Text>
							<Group gap={4} wrap="wrap">
								{detail.facilities.map((facility) => (
									<Badge key={facility} size="xs" variant="light" color="teal">
										{facility}
									</Badge>
								))}
							</Group>
							{payments.length ? (
								<Text size="xs" c="dimmed" mt={4}>
									Pays with: {payments.join(", ")}
								</Text>
							) : null}
						</Stack>
					) : null}
				</Group>

				<Divider label={`Menu (${rows.length} items)`} labelPosition="left" />
				<TextInput
					size="xs"
					placeholder="Filter this pub's menu…"
					value={query}
					onChange={(event) => setQuery(event.currentTarget.value)}
				/>
				<Box>
					{filtered.map((row) => {
						const group = `${row.menu} · ${row.category}`;
						const header = group !== lastGroup ? group : null;
						lastGroup = group;
						return (
							<Box key={row.name}>
								{header ? (
									<Text
										size="xs"
										fw={700}
										c="dimmed"
										tt="uppercase"
										mt="sm"
										mb={2}
									>
										{header}
									</Text>
								) : null}
								<UnstyledButton
									onClick={() => {
										onSelectItem(row.name);
										onClose();
									}}
									style={{
										display: "block",
										width: "100%",
										padding: "4px 6px",
										borderRadius: 6,
									}}
								>
									<Group justify="space-between" gap={8} wrap="nowrap">
										<Box style={{ minWidth: 0 }}>
											<Text size="sm" lineClamp={1}>
												{row.name}
											</Text>
											<Text size="xs" c="dimmed" lineClamp={1}>
												{[
													row.calories ? `${row.calories} kcal` : null,
													...row.badges,
												]
													.filter(Boolean)
													.join(" · ")}
											</Text>
										</Box>
										<Group gap={8} wrap="nowrap">
											{row.portions.map(([label, price]) => (
												<Text size="xs" key={label}>
													<Text span c="dimmed">
														{portionLabel(label)}{" "}
													</Text>
													<Text span fw={700}>
														{currencySymbol(currency)}
														{amount(price, currency)}
													</Text>
												</Text>
											))}
										</Group>
									</Group>
								</UnstyledButton>
							</Box>
						);
					})}
					{filtered.length ? null : (
						<Text size="sm" c="dimmed">
							Nothing matched.
						</Text>
					)}
				</Box>
			</Stack>
		</Modal>
	);
};
