import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Divider,
	Group,
	Modal,
	SegmentedControl,
	Stack,
	Text,
	TextInput,
	Tooltip,
} from "@mantine/core";
import { ArrowRight, Check, Plus } from "lucide-react";
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
const TODAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
	new Date().getDay()
];

type MenuRow = {
	name: string;
	menu: string;
	category: string;
	description: string | null;
	calories: number | null;
	badges: string[];
	portions: [string, number][];
	/** Price of the pub's canonical portion, for sorting. */
	from: number;
};

type Sort = "menu" | "cheapest" | "dearest";

type Props = {
	opened: boolean;
	onClose: () => void;
	venueRef: number | null;
	cache: SpoonersCache;
	/** Replace the whole round with this item. */
	onSelectItem: (name: string) => void;
	/** Add one of this item to the round. */
	onAddItem: (name: string) => void;
};

const PAGE = 100;

/** Everything known about one pub: address, hours, facilities and full menu. */
export const VenueModal = ({
	opened,
	onClose,
	venueRef,
	cache,
	onSelectItem,
	onAddItem,
}: Props) => {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("menu");
	const [limit, setLimit] = useState(PAGE);
	const [added, setAdded] = useState<string | null>(null);
	const entry = venueRef != null ? cache.venues[String(venueRef)] : undefined;

	const rows = useMemo<MenuRow[]>(() => {
		if (!entry) {
			return [];
		}
		const out: MenuRow[] = [];
		for (const [name, portions] of Object.entries(entry.items)) {
			const definition = cache.items[name];
			const sorted = Object.entries(portions).sort(
				(a, b) =>
					portionRank(a[0]) - portionRank(b[0]) || a[0].localeCompare(b[0]),
			);
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
				portions: sorted,
				from: sorted[0]?.[1] ?? 0,
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
		const list = needle
			? rows.filter(
					(row) =>
						row.name.toLowerCase().includes(needle) ||
						row.category.toLowerCase().includes(needle) ||
						row.menu.toLowerCase().includes(needle),
				)
			: rows;
		if (sort === "menu") {
			return list;
		}
		return [...list].sort((a, b) =>
			sort === "cheapest" ? a.from - b.from : b.from - a.from,
		);
	}, [rows, query, sort]);

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

	const add = (name: string) => {
		onAddItem(name);
		setAdded(name);
		window.setTimeout(
			() => setAdded((current) => (current === name ? null : current)),
			1200,
		);
	};

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
							const today = key === TODAY;
							return (
								<Text
									size="xs"
									key={key}
									fw={today ? 700 : undefined}
									c={today ? "teal" : undefined}
								>
									<strong>{DAY_LABEL[key]}</strong>{" "}
									{day?.open ? `${day.open}–${day.close ?? ""}` : "closed"}
									{today ? "  ← today" : ""}
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

				{rows.length ? (
					<>
						<Divider
							label={`Menu (${rows.length} items)`}
							labelPosition="left"
						/>
						<Group gap="xs" wrap="nowrap">
							<TextInput
								size="xs"
								placeholder="Filter this pub's menu…"
								value={query}
								style={{ flex: 1 }}
								onChange={(event) => {
									setQuery(event.currentTarget.value);
									setLimit(PAGE);
								}}
							/>
							<SegmentedControl
								size="xs"
								value={sort}
								data={[
									{ label: "Menu", value: "menu" },
									{ label: "Cheapest", value: "cheapest" },
									{ label: "Dearest", value: "dearest" },
								]}
								onChange={(value) => setSort(value as Sort)}
							/>
						</Group>
						<Box>
							{filtered.slice(0, limit).map((row) => {
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
										<Group
											justify="space-between"
											gap={8}
											wrap="nowrap"
											style={{ padding: "4px 0" }}
										>
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
												<Tooltip label="Add one to the round">
													<ActionIcon
														size="sm"
														variant={added === row.name ? "filled" : "light"}
														color={added === row.name ? "teal" : "blue"}
														aria-label={`Add ${row.name} to the round`}
														onClick={() => add(row.name)}
													>
														{added === row.name ? (
															<Check size={13} />
														) : (
															<Plus size={13} />
														)}
													</ActionIcon>
												</Tooltip>
												<Tooltip label="Show this drink on its own">
													<ActionIcon
														size="sm"
														variant="subtle"
														aria-label={`Show only ${row.name}`}
														onClick={() => {
															onSelectItem(row.name);
															onClose();
														}}
													>
														<ArrowRight size={13} />
													</ActionIcon>
												</Tooltip>
											</Group>
										</Group>
									</Box>
								);
							})}
							{filtered.length > limit ? (
								<Button
									variant="subtle"
									size="xs"
									fullWidth
									mt="sm"
									onClick={() => setLimit((value) => value + PAGE)}
								>
									Show {Math.min(PAGE, filtered.length - limit)} more (
									{filtered.length - limit} left)
								</Button>
							) : null}
							{filtered.length ? null : (
								<Text size="sm" c="dimmed">
									Nothing matched.
								</Text>
							)}
						</Box>
					</>
				) : (
					<>
						<Divider label="Menu" labelPosition="left" />
						<Text size="sm" c="dimmed">
							This pub's menu is not published by the API, so there are no
							prices to show. The address, hours and facilities above still
							apply.
						</Text>
					</>
				)}
			</Stack>
		</Modal>
	);
};
