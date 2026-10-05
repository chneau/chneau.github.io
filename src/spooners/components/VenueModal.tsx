import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Chip,
	Divider,
	Group,
	Modal,
	SegmentedControl,
	Stack,
	Text,
	TextInput,
	Tooltip,
	UnstyledButton,
} from "@mantine/core";
import {
	ArrowRight,
	Ban,
	Check,
	ChevronDown,
	ChevronRight,
	FileText,
	Globe,
	Mail,
	Milk,
	Phone,
	Plus,
	Wheat,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
	isTemporarilyClosed,
	venueImages,
	venueSpot,
	venueValues,
} from "../derive";
import { portionLabel } from "../portions";
import { amount, currencySymbol, money } from "../price";
import type {
	Formatter,
	ItemDefinition,
	SpoonersCache,
	VenueDetail,
} from "../types";
import {
	buildMenuRows,
	filterMenuRows,
	type MenuSort,
	type MenuRow as VenueMenuRow,
} from "../venueMenu";
import { ItemFacts } from "./ItemFacts";
import { SpotLabel } from "./SpotLabel";
import { VenueImage } from "./VenueImage";

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

type MenuRow = VenueMenuRow;
type Sort = MenuSort;

type Props = {
	opened: boolean;
	onClose: () => void;
	venueRef: number | null;
	cache: SpoonersCache;
	/** Replace the whole round with this item. */
	onSelectItem: (name: string) => void;
	/** Add one of this item to the round. */
	onAddItem: (name: string) => void;
	/** Open the full item detail modal. */
	onItem: (name: string) => void;
	format: Formatter;
};

const PAGE = 100;

/** One contact line: an icon, then a link rendered by the caller. */
const ContactLink = ({
	icon,
	href,
	children,
	external,
}: {
	icon: ReactNode;
	href: string;
	children: ReactNode;
	external?: boolean;
}) => (
	<Text size="sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
		{icon}
		<a href={href} target={external ? "_blank" : undefined} rel="noreferrer">
			{children}
		</a>
	</Text>
);

/**
 * The gallery: the chosen photo plus a strip of thumbnails when there is a
 * choice. Picking a photo here must not change the modal's own state, or a
 * photo chosen in one pub would follow the visitor to the next.
 */
const VenueGallery = ({
	images,
	name,
	hero,
	onHero,
}: {
	images: string[];
	name: string;
	hero: number;
	onHero: (index: number) => void;
}) => {
	if (!images.length) {
		return null;
	}
	return (
		<Box>
			<VenueImage
				// A photo picked in another pub can point past this pub's gallery;
				// never fall through to the placeholder when a photo exists.
				src={images[hero] ?? images[0]}
				alt={name}
				width="100%"
				height={200}
				radius={8}
			/>
			{images.length > 1 ? (
				<Group gap={6} mt={6} wrap="nowrap" style={{ overflowX: "auto" }}>
					{images.map((image, index) => (
						<Box
							key={image}
							onClick={() => onHero(index)}
							style={{
								cursor: "pointer",
								outline:
									index === hero
										? "2px solid var(--mantine-primary-color-filled)"
										: "none",
								borderRadius: 6,
							}}
						>
							<VenueImage
								src={image}
								alt={`${name} photo ${index + 1}`}
								width={54}
								height={44}
							/>
						</Box>
					))}
				</Group>
			) : null}
		</Box>
	);
};

/** Opening hours, with today called out, beside the facilities list. */
const VenueHours = ({
	days,
	facilities,
	payments,
}: {
	days: NonNullable<NonNullable<VenueDetail["openingTimes"]>["days"]>;
	facilities: VenueDetail["facilities"];
	payments: string[];
}) => (
	<>
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
							{today ? " · today" : ""}
						</Text>
					);
				})}
			</Stack>
			{facilities?.length ? (
				<Stack gap={2} style={{ flex: 1, minWidth: 180 }}>
					<Text size="xs" c="dimmed" fw={700} tt="uppercase">
						Facilities
					</Text>
					<Group gap={4} wrap="wrap">
						{facilities.map((facility) => (
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
	</>
);

/** One "best here" column: the top five rows for one value metric. */
const ValueColumn = ({
	title,
	rows,
	kind,
	currency,
	format,
	onItem,
	empty,
}: {
	title: string;
	rows: { name: string; value: number }[];
	kind: "calorie" | "unit";
	currency: string;
	format: Formatter;
	onItem: (name: string) => void;
	empty: string;
}) => (
	<Stack gap={2} style={{ minWidth: 220, flex: 1 }}>
		<Text size="xs" c="dimmed" fw={700} tt="uppercase">
			{title}
		</Text>
		{rows.map((row) => (
			<UnstyledButton key={row.name} onClick={() => onItem(row.name)}>
				<Group justify="space-between" gap={8} wrap="nowrap">
					<Text size="sm" lineClamp={1}>
						{row.name}
					</Text>
					<Text size="sm" fw={700}>
						{format.metric(kind, row.value, currency)}
					</Text>
				</Group>
			</UnstyledButton>
		))}
		{rows.length ? null : (
			<Text size="xs" c="dimmed">
				{empty}
			</Text>
		)}
	</Stack>
);

/** The API's own capability flags, as badges. */
const VenueCapabilityBadges = ({
	detail,
	currency,
}: {
	detail: VenueDetail | null;
	currency: string;
}) => (
	<Group gap={6} wrap="wrap">
		<Badge
			size="xs"
			variant="light"
			color={detail?.orderingEnabled ? "teal" : "gray"}
		>
			{detail?.orderingEnabled ? "ordering enabled" : "ordering off"}
		</Badge>
		{detail?.canPlaceOrder ? (
			<Badge size="xs" variant="light" color="teal">
				app orders
			</Badge>
		) : null}
		{detail?.comingSoon ? (
			<Badge size="xs" variant="light" color="grape">
				coming soon
			</Badge>
		) : null}
		{detail?.employeeDiscountAllowed ? (
			<Badge size="xs" variant="light" color="blue">
				staff discount
			</Badge>
		) : null}
		{detail?.isClosed ? (
			<Badge size="xs" variant="light" color="red">
				marked closed
			</Badge>
		) : null}
		{(detail?.salesAreas ?? []).map((area) => (
			<Badge size="xs" variant="light" color="gray" key={area.id}>
				sales area: {area.name}
			</Badge>
		))}
		{detail?.pricing?.includeDrink ? (
			<Badge size="xs" variant="light" color="gray">
				Meal deal: any drink +
				{money(detail.pricing.includeDrink.offset ?? 0, currency)}
				{detail.pricing.includeDrink.wineOffset != null
					? `, wine +${money(detail.pricing.includeDrink.wineOffset, currency)}`
					: ""}
			</Badge>
		) : null}
		{detail?.closureDates ? (
			<Badge size="xs" variant="light" color="orange">
				closure dates: {JSON.stringify(detail.closureDates)}
			</Badge>
		) : null}
	</Group>
);

/** Published dietary-menu links for this pub. */
const VenueDietaryLinks = ({ detail }: { detail: VenueDetail | null }) => (
	<Group gap="md" wrap="wrap">
		{detail?.allergensUrl ? (
			<ContactLink
				icon={<FileText size={14} />}
				href={detail.allergensUrl}
				external
			>
				Allergen information
			</ContactLink>
		) : null}
		{detail?.menuUrl?.dairyFree ? (
			<ContactLink
				icon={<Milk size={14} />}
				href={detail.menuUrl.dairyFree}
				external
			>
				dairy-free menu
			</ContactLink>
		) : null}
		{detail?.menuUrl?.glutenFree ? (
			<ContactLink
				icon={<Wheat size={14} />}
				href={detail.menuUrl.glutenFree}
				external
			>
				gluten-free menu
			</ContactLink>
		) : null}
	</Group>
);

/** One menu line: its portions, the two per-item actions, and its expanded facts. */
const MenuLine = ({
	row,
	header,
	currency,
	added,
	expanded,
	def,
	format,
	onAdd,
	onToggle,
	onOnly,
	onItem,
}: {
	row: MenuRow;
	/** Set on the first row of each menu · category group, `null` for the rest. */
	header: string | null;
	currency: string;
	added: boolean;
	expanded: boolean;
	def: ItemDefinition | null;
	format: Formatter;
	onAdd: (name: string) => void;
	onToggle: (name: string) => void;
	onOnly: (name: string) => void;
	onItem: (name: string) => void;
}) => (
	<Box>
		{header ? (
			<Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="sm" mb={2}>
				{header}
			</Text>
		) : null}
		<Group
			justify="space-between"
			gap={8}
			wrap="nowrap"
			style={{ padding: "4px 0" }}
		>
			<UnstyledButton
				style={{ minWidth: 0, textAlign: "left" }}
				onClick={() => onToggle(row.name)}
			>
				<Text
					size="sm"
					lineClamp={1}
					style={{ display: "flex", alignItems: "center", gap: 4 }}
				>
					{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
					{row.name}
				</Text>
				<Text size="xs" c="dimmed" lineClamp={1}>
					{[row.calories ? `${row.calories} kcal` : null, ...row.badges]
						.filter(Boolean)
						.join(" · ")}
				</Text>
			</UnstyledButton>
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
						variant={added ? "filled" : "light"}
						color={added ? "teal" : "blue"}
						aria-label={`Add ${row.name} to the round`}
						onClick={() => onAdd(row.name)}
					>
						{added ? <Check size={13} /> : <Plus size={13} />}
					</ActionIcon>
				</Tooltip>
				<Tooltip label="Show this drink on its own">
					<ActionIcon
						size="sm"
						variant="subtle"
						aria-label={`Show only ${row.name}`}
						onClick={() => onOnly(row.name)}
					>
						<ArrowRight size={13} />
					</ActionIcon>
				</Tooltip>
			</Group>
		</Group>
		{expanded ? (
			<Box ml={10} mt={2} mb={4}>
				<ItemFacts def={def ?? null} showOptions format={format} />
				<Group gap="xs" mt={4}>
					<Button
						size="compact-xs"
						variant="light"
						onClick={() => onItem(row.name)}
					>
						Full details &amp; best value
					</Button>
				</Group>
			</Box>
		) : null}
	</Box>
);

/**
 * Everything known about one pub: address, hours, facilities and full menu.
 *
 * App.tsx renders this unconditionally and only flips `opened`, so the modal
 * itself survives a switch from one pub to the next. The per-pub state (query,
 * sort, pager, hero photo, expanded row, menu filter) lives in `VenueModalBody`
 * instead, keyed on `opened`/`venueRef`: a key change remounts it, so each pub
 * starts fresh by construction. The previous shape held that state here and
 * wiped all of it from an effect on `opened`/`venueRef`, which cost an extra
 * render showing the previous pub's filter over the new pub's menu — a filter
 * naming a menu this pub does not sell rendered "Nothing matched." for a frame.
 */
export const VenueModal = ({
	opened,
	onClose,
	venueRef,
	cache,
	onSelectItem,
	onAddItem,
	onItem,
	format,
}: Props) => {
	const entry = venueRef != null ? cache.venues[String(venueRef)] : undefined;
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title={entry?.venue.name ?? "Pub"}
			centered
			size="lg"
		>
			<VenueModalBody
				key={`${opened ? "open" : "shut"}:${venueRef ?? "none"}`}
				onClose={onClose}
				venueRef={venueRef}
				cache={cache}
				onSelectItem={onSelectItem}
				onAddItem={onAddItem}
				onItem={onItem}
				format={format}
			/>
		</Modal>
	);
};

/** `opened` is the wrapper's business: the body is keyed on it, not driven by it. */
type BodyProps = Omit<Props, "opened">;

/** The pub's menu, with its own filter box, sort, menu chips and pager. */
const VenueMenu = ({
	rows,
	menus,
	filtered,
	currency,
	cache,
	format,
	added,
	expanded,
	query,
	sort,
	menuFilter,
	limit,
	onQuery,
	onSort,
	onMenuFilter,
	onMore,
	onAdd,
	onToggle,
	onOnly,
	onItem,
}: {
	rows: MenuRow[];
	menus: string[];
	filtered: MenuRow[];
	currency: string;
	cache: SpoonersCache;
	format: Formatter;
	added: string | null;
	expanded: string | null;
	query: string;
	sort: Sort;
	menuFilter: string | null;
	limit: number;
	onQuery: (value: string) => void;
	onSort: (value: Sort) => void;
	onMenuFilter: (value: string | null) => void;
	onMore: () => void;
	onAdd: (name: string) => void;
	onToggle: (name: string) => void;
	onOnly: (name: string) => void;
	onItem: (name: string) => void;
}) => {
	if (!rows.length) {
		return (
			<>
				<Divider label="Menu" labelPosition="left" />
				<Text size="sm" c="dimmed">
					This pub's menu is not published by the API, so there are no prices to
					show. The address, hours and facilities above still apply.
				</Text>
			</>
		);
	}

	let lastGroup = "";

	return (
		<>
			<Divider label={`Menu (${rows.length} items)`} labelPosition="left" />
			<Group gap="xs" wrap="nowrap">
				<TextInput
					size="xs"
					placeholder="Filter this pub's menu…"
					value={query}
					style={{ flex: 1 }}
					onChange={(event) => onQuery(event.currentTarget.value)}
				/>
				<SegmentedControl
					size="xs"
					value={sort}
					data={[
						{ label: "Menu", value: "menu" },
						{ label: "Cheapest", value: "cheapest" },
						{ label: "Dearest", value: "dearest" },
					]}
					onChange={(value) => onSort(value as Sort)}
				/>
			</Group>
			<Chip.Group value={menuFilter} onChange={onMenuFilter}>
				<Group gap={4}>
					{menus.map((menu) => (
						<Chip key={menu} size="xs" value={menu}>
							{menu}
						</Chip>
					))}
				</Group>
			</Chip.Group>
			<Box>
				{filtered.slice(0, limit).map((row) => {
					const group = `${row.menu} · ${row.category}`;
					const header = group !== lastGroup ? group : null;
					lastGroup = group;
					return (
						<MenuLine
							key={row.name}
							row={row}
							header={header}
							currency={currency}
							added={added === row.name}
							expanded={expanded === row.name}
							def={cache.items[row.name] ?? null}
							format={format}
							onAdd={onAdd}
							onToggle={onToggle}
							onOnly={onOnly}
							onItem={onItem}
						/>
					);
				})}
				{filtered.length > limit ? (
					<Button variant="subtle" size="xs" fullWidth mt="sm" onClick={onMore}>
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
	);
};

/**
 * Everything above the menu: how the pub presents itself, where it is, when it
 * opens, what it can do, and the two best-value lists. Kept apart from the menu
 * because none of it changes when the menu is filtered or paged.
 */
const VenueOverview = ({
	entry,
	hero,
	onHero,
	calorieRows,
	unitRows,
	format,
	onItem,
}: {
	entry: NonNullable<SpoonersCache["venues"][string]>;
	hero: number;
	onHero: (index: number) => void;
	calorieRows: { name: string; value: number }[];
	unitRows: { name: string; value: number }[];
	format: Formatter;
	onItem: (name: string) => void;
}) => {
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
	const images = venueImages(detail);

	return (
		<>
			<Group gap={6} wrap="wrap">
				{spot !== "high-street" ? (
					<Badge variant="light" color="grape">
						<SpotLabel spot={spot} />
					</Badge>
				) : null}
				{isTemporarilyClosed(venue.status) ? (
					<Badge variant="light" color="red" leftSection={<Ban size={12} />}>
						{venue.status?.replace("_", " ")}
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

			<VenueGallery
				images={images}
				name={venue.name}
				hero={hero}
				onHero={onHero}
			/>

			<Text size="sm">
				{[
					venue.address?.line1,
					venue.address?.line2,
					venue.address?.town,
					venue.address?.county,
					venue.address?.postcode,
				]
					.filter(Boolean)
					.join(", ")}
			</Text>

			<Group gap="md" wrap="wrap">
				{contact?.telephone ? (
					<ContactLink
						icon={<Phone size={14} />}
						href={`tel:${contact.telephone.replace(/\s/g, "")}`}
					>
						{contact.telephone}
					</ContactLink>
				) : null}
				{contact?.email ? (
					<ContactLink
						icon={<Mail size={14} />}
						href={`mailto:${contact.email}`}
					>
						{contact.email}
					</ContactLink>
				) : null}
				{contact?.website ? (
					<ContactLink
						icon={<Globe size={14} />}
						href={contact.website}
						external
					>
						website
					</ContactLink>
				) : null}
			</Group>

			<VenueHours
				days={days}
				facilities={detail?.facilities}
				payments={payments}
			/>

			{calorieRows.length || unitRows.length ? (
				<>
					<Divider label="Best value here" labelPosition="left" />
					<Group align="flex-start" gap="xl" wrap="wrap">
						<ValueColumn
							title="Most calories per £"
							rows={calorieRows}
							kind="calorie"
							currency={currency}
							format={format}
							onItem={onItem}
							empty="No calorie data."
						/>
						<ValueColumn
							title="Cheapest per alcohol unit"
							rows={unitRows}
							kind="unit"
							currency={currency}
							format={format}
							onItem={onItem}
							empty="No alcohol data."
						/>
					</Group>
				</>
			) : null}

			<Divider label="Details" labelPosition="left" />
			<VenueCapabilityBadges detail={detail} currency={currency} />
			{entry.menus.length ? (
				<Text size="xs" c="dimmed">
					Menus here: {entry.menus.map((menu) => menu.name).join(", ")}
				</Text>
			) : null}
			<VenueDietaryLinks detail={detail} />
		</>
	);
};

const VenueModalBody = ({
	onClose,
	venueRef,
	cache,
	onSelectItem,
	onAddItem,
	onItem,
	format,
}: BodyProps) => {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("menu");
	const [limit, setLimit] = useState(PAGE);
	const [added, setAdded] = useState<string | null>(null);
	const [hero, setHero] = useState(0);
	const [expanded, setExpanded] = useState<string | null>(null);
	const [menuFilter, setMenuFilter] = useState<string | null>(null);
	const entry = venueRef != null ? cache.venues[String(venueRef)] : undefined;

	const valueRows = useMemo(
		() => venueValues(cache, venueRef),
		[cache, venueRef],
	);
	const calorieRows = useMemo(
		() =>
			valueRows
				.filter((row) => row.kind === "calorie")
				.sort((a, b) => b.value - a.value)
				.slice(0, 5),
		[valueRows],
	);
	const unitRows = useMemo(
		() =>
			valueRows
				.filter((row) => row.kind === "unit")
				.sort((a, b) => a.value - b.value)
				.slice(0, 5),
		[valueRows],
	);

	const rows = useMemo(
		() => buildMenuRows(entry, cache.items),
		[entry, cache.items],
	);

	const menus = useMemo(
		() => [...new Set(rows.map((row) => row.menu))].sort(),
		[rows],
	);

	const filtered = useMemo(
		() => filterMenuRows(rows, { query, sort, menuFilter }),
		[rows, query, sort, menuFilter],
	);

	if (!entry) {
		// The title comes from the wrapper, which falls back to "Pub" here too.
		return <Text c="dimmed">No data for this pub.</Text>;
	}

	const currency =
		entry.detail?.currency?.code ??
		entry.detail?.currency?.currencyCode ??
		"GBP";

	const add = (name: string) => {
		onAddItem(name);
		setAdded(name);
		window.setTimeout(
			() => setAdded((current) => (current === name ? null : current)),
			1200,
		);
	};

	return (
		<Stack gap="xs" style={{ maxHeight: "72vh", overflowY: "auto" }}>
			<VenueOverview
				entry={entry}
				hero={hero}
				onHero={setHero}
				calorieRows={calorieRows}
				unitRows={unitRows}
				format={format}
				onItem={onItem}
			/>

			<VenueMenu
				rows={rows}
				menus={menus}
				filtered={filtered}
				currency={currency}
				cache={cache}
				format={format}
				added={added}
				expanded={expanded}
				query={query}
				sort={sort}
				menuFilter={menuFilter}
				limit={limit}
				onQuery={(value) => {
					setQuery(value);
					setLimit(PAGE);
				}}
				onSort={setSort}
				onMenuFilter={(value) => {
					setMenuFilter(value);
					setLimit(PAGE);
				}}
				onMore={() => setLimit((value) => value + PAGE)}
				onAdd={add}
				onToggle={(name) =>
					setExpanded((current) => (current === name ? null : name))
				}
				onOnly={(name) => {
					onSelectItem(name);
					onClose();
				}}
				onItem={onItem}
			/>
		</Stack>
	);
};
