import { Card, SimpleGrid, Text, Tooltip } from "@mantine/core";
import { Baby, Crown, HeartHandshake, Users } from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import {
	computeRecords,
	measuredPairScores,
	recordsDiagnostics,
} from "./records-summary";
import { dataStore } from "./store";

// Re-exported for the existing importers; the derivation and its caching live
// in `records-summary.ts`, which is pure and asserts the scorer cost itself.
export { computeRecords, recordsDiagnostics } from "./records-summary";

type RecordsWidgetProps = {
	data: readonly Birthday[];
};

const labelStyle: CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6,
	fontSize: 12,
	color: "var(--tk-text-dim)",
};

const valueStyle: CSSProperties = {
	display: "block",
	marginTop: 4,
	fontSize: "0.95rem",
	fontWeight: 600,
	color: "var(--tk-text)",
	overflowWrap: "anywhere",
};

const hintStyle: CSSProperties = {
	display: "block",
	marginTop: 2,
	fontSize: 11.5,
	color: "var(--tk-text-faint)",
};

const surfaceStyle: CSSProperties = {
	display: "block",
	width: "100%",
	padding: "10px 12px",
	borderRadius: "var(--app-radius-sm)",
	border: "1px solid var(--tk-border)",
	background: "var(--tk-surface-2)",
	textAlign: "left",
	color: "inherit",
	font: "inherit",
};

const RecordTile = ({
	icon,
	label,
	value,
	hint,
	tooltip,
	onSelect,
}: {
	icon: ReactNode;
	label: ReactNode;
	value: ReactNode;
	hint: ReactNode;
	tooltip?: string;
	onSelect?: () => void;
}) => {
	const body = (
		<>
			<span style={labelStyle}>
				{icon}
				{label}
			</span>
			<span style={valueStyle}>{value}</span>
			<span style={hintStyle}>{hint}</span>
		</>
	);

	// The tooltip is only attached to buttons, i.e. to tiles that a keyboard
	// can already reach. Non-actionable tiles carry their explanation in the
	// visible hint instead of in hover-only content.
	const content = onSelect ? (
		<button
			type="button"
			style={{ ...surfaceStyle, cursor: "pointer" }}
			onClick={onSelect}
		>
			{body}
		</button>
	) : (
		<div style={surfaceStyle}>{body}</div>
	);

	return tooltip ? (
		<Tooltip label={tooltip} withArrow>
			{content}
		</Tooltip>
	) : (
		content
	);
};

export const RecordsWidget = ({ data }: RecordsWidgetProps) => {
	const { t } = useTranslation();
	const people = useMemo(() => data.filter((x) => x.kind !== "💒"), [data]);

	const records = useMemo(() => {
		recordsDiagnostics.computations += 1;
		const summary = computeRecords(people);
		recordsDiagnostics.pairScores = measuredPairScores();
		return summary;
	}, [people]);

	// No visible people means no record can be awarded; the list above this
	// widget already explains an empty filter result.
	if (!records) return null;

	const socialite = records.socialite;
	const secondary: string[] = [];
	if (records.twins.length === 0) {
		if (records.sameSign) {
			secondary.push(
				t("app.records.same_sign_line", {
					names: records.sameSign.names.join(", "),
					sign: t(`data.zodiac.${records.sameSign.sign}`),
				}),
			);
		}
		if (records.sameGeneration) {
			secondary.push(
				t("app.records.same_generation_line", {
					names: records.sameGeneration.names.join(", "),
					generation: t(
						`data.generations.${records.sameGeneration.generation}`,
					),
				}),
			);
		}
	}

	return (
		<Card withBorder style={{ marginTop: 16 }}>
			<Text fw={600} style={{ marginBottom: 8 }}>
				{t("app.records.title")}
			</Text>
			<SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
				<RecordTile
					icon={<Crown size={13} strokeWidth={1.9} aria-hidden="true" />}
					label={t("app.records.elder")}
					value={records.elder.name}
					hint={`${records.elder.age} ${t("app.records.years")}`}
					tooltip={t("app.records.elder_tooltip", { name: records.elder.name })}
					onSelect={() => {
						dataStore.selectedBirthday = records.elder;
					}}
				/>
				<RecordTile
					icon={<Baby size={13} strokeWidth={1.9} aria-hidden="true" />}
					label={t("app.records.rookie")}
					value={records.rookie.name}
					hint={`${records.rookie.age} ${t("app.records.years")}`}
					tooltip={t("app.records.rookie_tooltip", {
						name: records.rookie.name,
					})}
					onSelect={() => {
						dataStore.selectedBirthday = records.rookie;
					}}
				/>
				<RecordTile
					icon={
						<HeartHandshake size={13} strokeWidth={1.9} aria-hidden="true" />
					}
					label={t("app.records.socialite")}
					value={socialite ? socialite.person.name : "—"}
					hint={
						socialite
							? t("app.records.perfect_matches", { count: socialite.count })
							: t("app.records.no_socialite")
					}
					tooltip={
						socialite
							? t("app.records.socialite_tooltip", {
									name: socialite.person.name,
									count: socialite.count,
								})
							: undefined
					}
					onSelect={
						socialite
							? () => {
									dataStore.selectedBirthday = socialite.person;
								}
							: undefined
					}
				/>
				<RecordTile
					icon={<Users size={13} strokeWidth={1.9} aria-hidden="true" />}
					label={t("app.records.twins")}
					value={`${records.twins.length} ${t("app.records.twins_suffix")}`}
					hint={
						records.twins.length > 0
							? records.twins
									.map((pair) => pair.map((x) => x.name).join(" & "))
									.join(", ")
							: t("app.records.no_twins")
					}
				/>
			</SimpleGrid>
			{secondary.length > 0 ? (
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: "4px 16px",
						marginTop: 10,
						fontSize: 11.5,
						color: "var(--tk-text-faint)",
					}}
				>
					{secondary.map((line) => (
						<span key={line}>{line}</span>
					))}
				</div>
			) : null}
		</Card>
	);
};
