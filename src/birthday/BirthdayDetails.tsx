import {
	Alert,
	Badge,
	Button,
	Card,
	Divider,
	SimpleGrid,
	Text,
	Tooltip,
} from "@mantine/core";
import dayjs from "dayjs";
import { lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { birthdays } from "./birthdays";
import {
	getCompatibleElements,
	getDuplicateRecords,
	getSameNamedRecords,
	isSameRecord,
} from "./compatibility";
import { notify } from "./notify";
import { OnThisDay } from "./OnThisDay";
import { ShareCard, shareCardFileName } from "./ShareCard";
import { store } from "./store";

const BiorhythmsChart = lazy(() =>
	import("./BiorhythmsChart").then((m) => ({ default: m.BiorhythmsChart })),
);

type BirthdayDetailsProps = {
	record: Birthday;
};

export const BirthdayDetails = ({ record }: BirthdayDetailsProps) => {
	const { t, i18n } = useTranslation();
	const [downloading, setDownloading] = useState(false);
	// Inline as well as in a toast: a rasterise that fails after a few hundred
	// milliseconds is easy to miss as a transient notification, and the click
	// that caused it looks like a dead click without one.
	const [cardError, setCardError] = useState<string | null>(null);
	// A ref beats `getElementById(\`card-${record.name}\`)`: the name is free
	// text and would have to survive being an id, and it is not unique enough
	// to rely on across rows.
	const cardRef = useRef<HTMLDivElement | null>(null);

	// Identity is the exact (name, birthdayString) pair — see `isSameRecord`.
	// The previous `b.name !== record.name` filter keyed on a *display* label,
	// so it hid a genuine same-named person who shared the date.
	const sameBirthday = birthdays.filter(
		(b) =>
			!isSameRecord(b, record) &&
			b.month === record.month &&
			b.day === record.day,
	);
	// Same-named rows are scored independently on their own element, so the
	// "compatible" badges below are not a claim about those people. A row that
	// is duplicated outright cannot be told from its twin at all, and must not
	// be presented as matching.
	const sameNamed = getSameNamedRecords(birthdays, record);
	const duplicates = getDuplicateRecords(birthdays, record);
	const compatibleElements = getCompatibleElements(record.element);

	/**
	 * English text for the keys this adds. `locales/*.json` is owned elsewhere,
	 * so each key is looked up as a candidate list with this default attached
	 * (the pattern `ManageBirthdaysModal` uses): until a key is translated it
	 * degrades to English instead of leaking `"app.compatibility.some_key"` into
	 * the UI. Once the keys land in `en.json` the default is simply unused.
	 */
	const NEW_MESSAGES = {
		"app.compatibility.duplicate_row":
			"This name and date are also saved as {{count}} other entr{{count, plural, one {y} other {ies}} — the data cannot tell them apart, so no match is claimed here.",
		"app.compatibility.same_name_note":
			"{{count}} other entr{{count, plural, one {y}} named {{name}} {{count, plural, one {is} other {are}} listed here; they are separate people, scored on their own zodiac element.",
		"app.compatibility.shared_birthday": "Shared: {{names}}",
	} as const;
	const tn = (
		key: keyof typeof NEW_MESSAGES,
		params?: Record<string, string | number>,
	) => t([key], { ...params, defaultValue: NEW_MESSAGES[key] });

	const handleDownloadCard = async () => {
		const element = cardRef.current;
		if (!element) {
			setCardError(t("app.card_error"));
			return;
		}

		setCardError(null);
		setDownloading(true);
		try {
			const html2canvas = (await import("html2canvas")).default;
			const canvas = await html2canvas(element, {
				// The card paints its own opaque background (see ShareCard), so
				// there is nothing for html2canvas to fill in behind it — and
				// nothing that could tie the export to the current theme.
				backgroundColor: null,
				scale: 2,
				logging: false,
			});
			const link = document.createElement("a");
			link.download = shareCardFileName(record.name);
			link.href = canvas.toDataURL("image/png");
			link.click();
			notify.success(`Downloaded birthday card for ${record.name}! 📸`);
		} catch (e) {
			console.error("Failed to generate card", e);
			const message = t("app.card_error");
			setCardError(message);
			notify.error(message);
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div style={{ padding: "8px 12px" }}>
			<Alert
				title={t("app.title")}
				icon={<span>🔮</span>}
				color="blue"
				variant="light"
				style={{ marginBottom: 12 }}
			>
				{t(`data.insights.${record.dailyInsight}`)}
			</Alert>

			<div
				style={{
					display: "flex",
					gap: 12,
					flexWrap: "wrap",
					alignItems: "center",
					marginBottom: 12,
				}}
			>
				<Button
					leftSection={<span>📸</span>}
					size="sm"
					// Mantine's `loading` swaps the left section for a spinner and
					// blocks the button, so a second click cannot queue a second
					// rasterise; `aria-busy` carries the same state to assistive
					// tech, which does not see the spinner.
					loading={downloading}
					aria-busy={downloading}
					onClick={handleDownloadCard}
				>
					{t("app.card")}
				</Button>
				{cardError && (
					<Text size="xs" c="red" role="alert">
						{cardError}
					</Text>
				)}
				<Divider orientation="vertical" style={{ height: 20 }} />
				<a
					href={`https://en.wikipedia.org/wiki/${record.year}`}
					target="_blank"
					rel="noreferrer"
					style={{ fontSize: "13px" }}
				>
					📜 Year {record.year} on Wikipedia
				</a>
				<Divider orientation="vertical" style={{ height: 20 }} />
				<a
					href={`https://en.wikipedia.org/wiki/${dayjs(record.birthday)
						.locale("en")
						.format("MMMM")}_${record.day}`}
					target="_blank"
					rel="noreferrer"
					style={{ fontSize: "13px" }}
				>
					📅 {t("app.events")} on Wikipedia
				</a>
			</div>

			<OnThisDay month={record.month} day={record.day} />

			<div style={{ marginTop: 12, marginBottom: 16 }}>
				<Text fw={600} component="span">
					📜 {t("headers.etymology")}:
				</Text>
				<Text fs="italic" component="span">
					{record.name
						.split(" & ")
						.map((n) => {
							const key = `data.names.${n}`;
							const hasKey = i18n.exists(key);
							const ety = hasKey
								? (i18n.t as unknown as (k: string) => string)(key)
								: "";
							return ety
								? record.name.includes(" & ")
									? `${n}: ${ety}`
									: ety
								: record.name.includes(" & ")
									? n
									: t("app.no_data");
						})
						.join(" | ")}
				</Text>
			</div>

			{/* Grouped, structured information cards */}
			<SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing={12}>
				{/* Life Progress & Milestones */}
				<Card withBorder style={{ height: "100%" }}>
					<Text fw={600} style={{ marginBottom: 8 }}>
						📈 {t("headers.life_progress")}
					</Text>
					<ul
						style={{
							paddingLeft: 16,
							margin: 0,
							fontSize: "12px",
							lineHeight: "1.8",
						}}
					>
						<li>
							🗓️ {record.ageInDays.toLocaleString()} {t("units.d")} /{" "}
							{record.ageInWeeks.toLocaleString()} {t("units.w")}
						</li>
						<li>
							🗓️ {record.ageInMonths.toLocaleString()} {t("units.months_lived")}
						</li>
						<li>
							🌓 {t("units.half")}:{" "}
							{t(`data.months.${record.halfBirthdayMonth}`)}{" "}
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
					{sameBirthday.length > 0 && (
						<div style={{ marginTop: 4, fontSize: "12px" }}>
							<Text c="dimmed" component="span">
								👯{" "}
								{tn("app.compatibility.shared_birthday", {
									names: sameBirthday.map((b) => b.name).join(", "),
								})}
							</Text>
						</div>
					)}
				</Card>

				{/* Astrology & Numerology */}
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
					{duplicates.length > 0 && (
						<div style={{ marginTop: 6, fontSize: "11px" }}>
							<Text c="yellow" component="span">
								⚠️{" "}
								{tn("app.compatibility.duplicate_row", {
									count: duplicates.length,
								})}
							</Text>
						</div>
					)}
					{duplicates.length === 0 && sameNamed.length > 0 && (
						<div style={{ marginTop: 6, fontSize: "11px" }}>
							<Text c="dimmed" component="span">
								ℹ️{" "}
								{tn("app.compatibility.same_name_note", {
									count: sameNamed.length,
									name: record.name,
								})}
							</Text>
						</div>
					)}
				</Card>

				{/* Cosmic & Biological Stats */}
				<Card withBorder style={{ height: "100%" }}>
					<Text fw={600} style={{ marginBottom: 8 }}>
						💓 {t("headers.stats")}
					</Text>
					<ul
						style={{
							paddingLeft: 16,
							margin: 0,
							fontSize: "12px",
							lineHeight: "1.8",
						}}
					>
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

				{/* Planetary Ages */}
				<Card withBorder style={{ height: "100%" }}>
					<Text fw={600} style={{ marginBottom: 8 }}>
						🪐 {t("headers.planets")}
					</Text>
					<ul
						style={{
							paddingLeft: 16,
							margin: 0,
							fontSize: "12px",
							lineHeight: "1.8",
						}}
					>
						{record.planetAges.map((p) => (
							<li key={p.name}>
								{p.icon} {t(`data.planets.${p.name}`)}: {p.age.toFixed(1)}{" "}
								{t("units.y")}
							</li>
						))}
					</ul>
				</Card>
			</SimpleGrid>

			{/* Biorhythms Visual Chart */}
			<div style={{ marginTop: 12 }}>
				<Suspense fallback={<div style={{ minHeight: 180 }} />}>
					<BiorhythmsChart birthday={record.birthday} />
				</Suspense>
			</div>

			{/*
			 * Offscreen purely so html2canvas has a laid-out node to
			 * rasterise. It must stay *rendered* rather than `display: none`
			 * or `visibility: hidden`: html2canvas skips anything whose
			 * computed display/opacity/visibility says it is not painted, so
			 * either would hand back an empty PNG.
			 *
			 * `aria-hidden` because it is a duplicate of content already on the
			 * page, and screen readers should not meet it twice.
			 */}
			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					left: "-9999px",
					top: 0,
					// Belt and braces: the node is off-canvas, but a stray
					// pointer event on it would be invisible and unreachable.
					pointerEvents: "none",
				}}
			>
				<ShareCard ref={cardRef} record={record} />
			</div>
		</div>
	);
};
