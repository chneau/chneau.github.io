import { Card, SimpleGrid, Text, Tooltip } from "@mantine/core";
import { Baby, Crown, HeartHandshake, Users } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { getCompatibilityScore } from "./compatibility";
import { dataStore } from "./store";

const RecordTitle = ({
	icon,
	children,
}: {
	icon: ReactNode;
	children: ReactNode;
}) => (
	<span
		style={{
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			fontSize: 13,
		}}
	>
		{icon}
		{children}
	</span>
);

type RecordsWidgetProps = {
	data: readonly Birthday[];
};

export const RecordsWidget = ({ data }: RecordsWidgetProps) => {
	const { t } = useTranslation();
	const people = useMemo(() => data.filter((x) => x.kind !== "💒"), [data]);

	const records = useMemo(() => {
		if (people.length === 0) return null;

		const sortedByAge = [...people].sort((a, b) => b.age - a.age);
		const elder = sortedByAge[0];
		const rookie = sortedByAge[sortedByAge.length - 1];

		const bestSocialite = people.reduce<{ name: string; count: number } | null>(
			(best, p1) => {
				const count = people.filter(
					(p2) => p1.name !== p2.name && getCompatibilityScore(p1, p2) === 100,
				).length;
				return !best || count > best.count ? { name: p1.name, count } : best;
			},
			null,
		);

		const twins: string[][] = [];
		for (let i = 0; i < people.length; i++) {
			for (let j = i + 1; j < people.length; j++) {
				const p1 = people[i] as Birthday;
				const p2 = people[j] as Birthday;
				if (p1.month === p2.month && p1.day === p2.day) {
					twins.push([p1.name, p2.name]);
				}
			}
		}

		return { elder, rookie, bestSocialite, twins };
	}, [people]);

	if (!records) return null;

	const valueStyle = {
		fontSize: "1em",
		color: "var(--tk-accent-ink)",
		textDecoration: "underline",
	} as const;

	return (
		<Card withBorder style={{ marginTop: 16, minHeight: 100 }}>
			<Text fw={600} style={{ marginBottom: 8 }}>
				{t("app.records.title")}
			</Text>
			<SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
				<div style={{ textAlign: "center" }}>
					<Tooltip
						label={t("app.records.elder_tooltip", {
							name: records.elder?.name,
						})}
					>
						<button
							type="button"
							style={{
								cursor: records.elder ? "pointer" : "default",
								background: "none",
								border: "none",
								padding: 0,
								width: "100%",
							}}
							onClick={() => {
								if (records.elder) dataStore.selectedBirthday = records.elder;
							}}
						>
							<Text size="sm" c="dimmed">
								<RecordTitle icon={<Crown size={13} strokeWidth={1.9} />}>
									{t("app.records.elder")}
								</RecordTitle>
							</Text>
							<Text style={valueStyle}>{records.elder?.name}</Text>
						</button>
					</Tooltip>
				</div>
				<div style={{ textAlign: "center" }}>
					<Tooltip
						label={t("app.records.rookie_tooltip", {
							name: records.rookie?.name,
						})}
					>
						<button
							type="button"
							style={{
								cursor: records.rookie ? "pointer" : "default",
								background: "none",
								border: "none",
								padding: 0,
								width: "100%",
							}}
							onClick={() => {
								if (records.rookie) dataStore.selectedBirthday = records.rookie;
							}}
						>
							<Text size="sm" c="dimmed">
								<RecordTitle icon={<Baby size={13} strokeWidth={1.9} />}>
									{t("app.records.rookie")}
								</RecordTitle>
							</Text>
							<Text style={valueStyle}>{records.rookie?.name}</Text>
						</button>
					</Tooltip>
				</div>
				<div style={{ textAlign: "center" }}>
					<Tooltip
						label={t("app.records.socialite_tooltip", {
							name: records.bestSocialite?.name,
							count: records.bestSocialite?.count,
						})}
					>
						<button
							type="button"
							style={{
								cursor: records.bestSocialite ? "pointer" : "default",
								background: "none",
								border: "none",
								padding: 0,
								width: "100%",
							}}
							onClick={() => {
								if (records.bestSocialite) {
									const match = people.find(
										(p) => p.name === records.bestSocialite?.name,
									);
									if (match) dataStore.selectedBirthday = match;
								}
							}}
						>
							<Text size="sm" c="dimmed">
								<RecordTitle
									icon={<HeartHandshake size={13} strokeWidth={1.9} />}
								>
									{t("app.records.socialite")}
								</RecordTitle>
							</Text>
							<Text style={valueStyle}>{records.bestSocialite?.name}</Text>
						</button>
					</Tooltip>
				</div>
				<div style={{ textAlign: "center" }}>
					<Tooltip
						label={
							records.twins.length > 0
								? t("app.records.twins_tooltip", {
										pairs: records.twins.map((t) => t.join(" & ")).join(", "),
									})
								: t("app.records.no_twins")
						}
					>
						<Text size="sm" c="dimmed">
							<RecordTitle icon={<Users size={13} strokeWidth={1.9} />}>
								{t("app.records.twins")}
							</RecordTitle>
						</Text>
						<Text style={{ fontSize: "1em" }}>
							{records.twins.length} {t("app.records.twins_suffix")}
						</Text>
					</Tooltip>
				</div>
			</SimpleGrid>
		</Card>
	);
};
