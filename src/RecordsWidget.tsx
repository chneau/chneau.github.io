import { Card, Col, Row, Statistic, Tooltip } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { getCompatibilityScore } from "./compatibility";

type RecordsWidgetProps = {
	data: readonly Birthday[];
};

export const RecordsWidget = ({ data }: RecordsWidgetProps) => {
	const { t } = useTranslation();
	const people = useMemo(() => data.filter((x) => x.kind !== "💒"), [data]);

	const records = useMemo(() => {
		if (people.length === 0) return null;

		// 1. Elder & Rookie
		const sortedByAge = [...people].sort((a, b) => b.age - a.age);
		const elder = sortedByAge[0];
		const rookie = sortedByAge[sortedByAge.length - 1];

		// 2. Socialite (Most 100% compatibility matches)
		let bestSocialite: { name: string; count: number } | null = null;
		for (const p1 of people) {
			let count = 0;
			for (const p2 of people) {
				if (p1.name !== p2.name && getCompatibilityScore(p1, p2) === 100) {
					count++;
				}
			}
			if (!bestSocialite || count > bestSocialite.count) {
				bestSocialite = { name: p1.name, count };
			}
		}

		// 3. Birthday Twins (Same day and month)
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

	return (
		<Card
			title={t("app.records.title")}
			size="small"
			style={{ marginTop: 16, minHeight: 100 }}
		>
			<Row gutter={[16, 16]} justify="center">
				<Col xs={12} sm={6} style={{ textAlign: "center" }}>
					<Tooltip
						title={t("app.records.elder_tooltip", {
							name: records.elder?.name,
						})}
					>
						<Statistic
							title={`👴 ${t("app.records.elder")}`}
							value={records.elder?.name}
							styles={{ content: { fontSize: "1em" } }}
						/>
					</Tooltip>
				</Col>
				<Col xs={12} sm={6} style={{ textAlign: "center" }}>
					<Tooltip
						title={t("app.records.rookie_tooltip", {
							name: records.rookie?.name,
						})}
					>
						<Statistic
							title={`👶 ${t("app.records.rookie")}`}
							value={records.rookie?.name}
							styles={{ content: { fontSize: "1em" } }}
						/>
					</Tooltip>
				</Col>
				<Col xs={12} sm={6} style={{ textAlign: "center" }}>
					<Tooltip
						title={t("app.records.socialite_tooltip", {
							name: records.bestSocialite?.name,
							count: records.bestSocialite?.count,
						})}
					>
						<Statistic
							title={`🤝 ${t("app.records.socialite")}`}
							value={records.bestSocialite?.name}
							styles={{ content: { fontSize: "1em" } }}
						/>
					</Tooltip>
				</Col>
				<Col xs={12} sm={6} style={{ textAlign: "center" }}>
					<Tooltip
						title={
							records.twins.length > 0
								? t("app.records.twins_tooltip", {
										pairs: records.twins.map((t) => t.join(" & ")).join(", "),
									})
								: t("app.records.no_twins")
						}
					>
						<Statistic
							title={`👯 ${t("app.records.twins")}`}
							value={records.twins.length}
							suffix={t("app.records.twins_suffix")}
							styles={{ content: { fontSize: "1em" } }}
						/>
					</Tooltip>
				</Col>
			</Row>
		</Card>
	);
};
