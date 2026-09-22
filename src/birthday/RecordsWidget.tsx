import { Card, Col, Row, Statistic, Tooltip } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { getCompatibilityScore } from "./compatibility";
import { dataStore } from "./store";

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
							<Statistic
								title={`👴 ${t("app.records.elder")}`}
								value={records.elder?.name}
								styles={{
									content: {
										fontSize: "1em",
										color: "#1677ff",
										textDecoration: "underline",
									},
								}}
							/>
						</button>
					</Tooltip>
				</Col>
				<Col xs={12} sm={6} style={{ textAlign: "center" }}>
					<Tooltip
						title={t("app.records.rookie_tooltip", {
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
							<Statistic
								title={`👶 ${t("app.records.rookie")}`}
								value={records.rookie?.name}
								styles={{
									content: {
										fontSize: "1em",
										color: "#1677ff",
										textDecoration: "underline",
									},
								}}
							/>
						</button>
					</Tooltip>
				</Col>
				<Col xs={12} sm={6} style={{ textAlign: "center" }}>
					<Tooltip
						title={t("app.records.socialite_tooltip", {
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
							<Statistic
								title={`🤝 ${t("app.records.socialite")}`}
								value={records.bestSocialite?.name}
								styles={{
									content: {
										fontSize: "1em",
										color: "#1677ff",
										textDecoration: "underline",
									},
								}}
							/>
						</button>
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
