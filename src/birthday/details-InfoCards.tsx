import { Badge, Card, SimpleGrid, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { getCompatibleElements } from "./compatibility";
import { useCompatibilityMessages } from "./details-compatibility-messages";
import { store } from "./store";

/**
 * The four grouped information cards in the expanded row.
 *
 * Each card is its own component because each is a self-contained reading of
 * one facet of the record with its own data dependencies: grouping them here
 * rather than in `BirthdayDetails` is what lets the card that talks about
 * compatibility own the compatibility qualifiers, and the card that lists
 * planetary ages own the list, without either dragging the other along.
 */

type RecordCardProps = {
	record: Birthday;
};

/** The `<ul>` every stat card shares; the line height is the only tuning. */
const statListStyle = {
	paddingLeft: 16,
	margin: 0,
	fontSize: "12px",
	lineHeight: "1.8",
} as const;

const LifeProgressCard = ({
	record,
	sharedNames,
}: RecordCardProps & {
	/** Names of the *other* people whose birthday falls on this same day. */
	sharedNames: readonly string[];
}) => {
	const { t } = useTranslation();
	const tn = useCompatibilityMessages();

	return (
		<Card withBorder style={{ height: "100%" }}>
			<Text fw={600} style={{ marginBottom: 8 }}>
				📈 {t("headers.life_progress")}
			</Text>
			<ul style={statListStyle}>
				<li>
					🗓️ {record.ageInDays.toLocaleString()} {t("units.d")} /{" "}
					{record.ageInWeeks.toLocaleString()} {t("units.w")}
				</li>
				<li>
					🗓️ {record.ageInMonths.toLocaleString()} {t("units.months_lived")}
				</li>
				<li>
					🌓 {t("units.half")}: {t(`data.months.${record.halfBirthdayMonth}`)}{" "}
					{record.halfBirthdayDay}
				</li>
				<li>
					{record.moonPhaseIcon} {t(`data.moon_phases.${record.moonPhase}`)}
				</li>
			</ul>
			{record.milestone && (
				<div style={{ marginTop: 8, fontSize: "12px" }}>
					<Text fw={600} component="span">
						🎯 {t("headers.milestones")}:
					</Text>
					<span>{t(record.milestone.key, record.milestone.params)}</span>
				</div>
			)}
			{sharedNames.length > 0 && (
				<div style={{ marginTop: 4, fontSize: "12px" }}>
					<Text c="dimmed" component="span">
						👯{" "}
						{tn("app.compatibility.shared_birthday", {
							names: sharedNames.join(", "),
						})}
					</Text>
				</div>
			)}
		</Card>
	);
};

const TraitsMatchCard = ({
	record,
	duplicateCount,
	sameNamedCount,
}: RecordCardProps & {
	/** How many stored rows share this record's exact name and date. */
	duplicateCount: number;
	/** How many *other* people are listed under the same name. */
	sameNamedCount: number;
}) => {
	const { t } = useTranslation();
	const tn = useCompatibilityMessages();
	const compatibleElements = getCompatibleElements(record.element);

	return (
		<Card withBorder style={{ height: "100%" }}>
			<Text fw={600} style={{ marginBottom: 8 }}>
				✨ {t("headers.traits_match")}
			</Text>
			<p style={{ margin: "0 0 8px 0", fontSize: "12px" }}>
				{t(`data.zodiac_traits.${record.sign}`)}
			</p>
			<div style={{ marginBottom: 8, fontSize: "12px" }}>
				<Tooltip label={t("units.path_tooltip")}>
					<span>
						<Text fw={600} component="span">
							🔢 {t("units.path")} {record.lifePathNumber}:
						</Text>
						<Text c="dimmed" component="span">
							{t(`data.life_path.${record.lifePathMeaning}`)}
						</Text>
					</span>
				</Tooltip>
			</div>
			<div>
				<Text fw={600} component="span" style={{ fontSize: "11px" }}>
					Compatible:
				</Text>
				{compatibleElements.map((element) => (
					<Badge
						key={element}
						variant="light"
						style={{
							cursor: "pointer",
							fontSize: "10px",
							padding: "0 4px",
						}}
						onClick={() => {
							store.search = element;
							window.scrollTo({ top: 0, behavior: "smooth" });
						}}
					>
						{t(`data.elements.${element}`)}
					</Badge>
				))}
			</div>
			{/* Qualifiers. The badges above come from *this* record's
			    element alone, so say so when the list holds another
			    entry with the same name — otherwise "compatible" reads as
			    "these people match". A duplicated row is weaker still:
			    it is indistinguishable from its twin, so no match may be
			    claimed at all. */}
			{duplicateCount > 0 && (
				<div style={{ marginTop: 6, fontSize: "11px" }}>
					<Text c="yellow" component="span">
						⚠️ {tn("app.compatibility.duplicate_row", { count: duplicateCount })}
					</Text>
				</div>
			)}
			{duplicateCount === 0 && sameNamedCount > 0 && (
				<div style={{ marginTop: 6, fontSize: "11px" }}>
					<Text c="dimmed" component="span">
						ℹ️{" "}
						{tn("app.compatibility.same_name_note", {
							count: sameNamedCount,
							name: record.name,
						})}
					</Text>
				</div>
			)}
		</Card>
	);
};

const CosmicStatsCard = ({ record }: RecordCardProps) => {
	const { t } = useTranslation();

	return (
		<Card withBorder style={{ height: "100%" }}>
			<Text fw={600} style={{ marginBottom: 8 }}>
				💓 {t("headers.stats")}
			</Text>
			<ul style={statListStyle}>
				<li>
					<Tooltip label={t("units.beats_tooltip")}>
						<span>
							💓 {record.heartbeats.toLocaleString()} {t("units.beats")}
						</span>
					</Tooltip>
				</li>
				<li>
					<Tooltip label={t("units.breaths_tooltip")}>
						<span>
							🫁 {record.breaths.toLocaleString()} {t("units.breaths")}
						</span>
					</Tooltip>
				</li>
				<li>
					<Tooltip label={t("units.km_orbit_tooltip")}>
						<span>
							🚀 {record.distanceTraveled.toLocaleString()}{" "}
							{t("units.km_orbit")}
						</span>
					</Tooltip>
				</li>
			</ul>
		</Card>
	);
};

const PlanetaryAgesCard = ({ record }: RecordCardProps) => {
	const { t } = useTranslation();

	return (
		<Card withBorder style={{ height: "100%" }}>
			<Text fw={600} style={{ marginBottom: 8 }}>
				🪐 {t("headers.planets")}
			</Text>
			<ul style={statListStyle}>
				{record.planetAges.map((p) => (
					<li key={p.name}>
						{p.icon} {t(`data.planets.${p.name}`)}: {p.age.toFixed(1)}{" "}
						{t("units.y")}
					</li>
				))}
			</ul>
		</Card>
	);
};

/**
 * The four cards in one grid, in the order the row has always shown them.
 */
export const DetailsInfoCards = ({
	record,
	sharedNames,
	duplicateCount,
	sameNamedCount,
}: RecordCardProps & {
	sharedNames: readonly string[];
	duplicateCount: number;
	sameNamedCount: number;
}) => (
	<SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing={12}>
		<LifeProgressCard record={record} sharedNames={sharedNames} />
		<TraitsMatchCard
			record={record}
			duplicateCount={duplicateCount}
			sameNamedCount={sameNamedCount}
		/>
		<CosmicStatsCard record={record} />
		<PlanetaryAgesCard record={record} />
	</SimpleGrid>
);
