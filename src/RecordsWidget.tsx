import { Card, Col, Row, Statistic, Tooltip } from "antd";
import { useMemo } from "react";
import type { Birthday } from "./birthdays";
import { getCompatibilityScore } from "./compatibility";

interface RecordsWidgetProps {
	data: readonly Birthday[];
}

export const RecordsWidget = ({ data }: RecordsWidgetProps) => {
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
		<Card title="Birthday Records 🏆" size="small" style={{ marginTop: 16 }}>
			<Row gutter={[16, 16]}>
				<Col xs={12} sm={6}>
					<Tooltip title={`${records.elder?.name} is the oldest member.`}>
						<Statistic
							title="👴 The Elder"
							value={records.elder?.name}
							valueStyle={{ fontSize: "1em" }}
						/>
					</Tooltip>
				</Col>
				<Col xs={12} sm={6}>
					<Tooltip title={`${records.rookie?.name} is the youngest member.`}>
						<Statistic
							title="👶 The Rookie"
							value={records.rookie?.name}
							valueStyle={{ fontSize: "1em" }}
						/>
					</Tooltip>
				</Col>
				<Col xs={12} sm={6}>
					<Tooltip
						title={`${records.bestSocialite?.name} has ${records.bestSocialite?.count} perfect matches!`}
					>
						<Statistic
							title="🤝 The Socialite"
							value={records.bestSocialite?.name}
							valueStyle={{ fontSize: "1em" }}
						/>
					</Tooltip>
				</Col>
				<Col xs={12} sm={6}>
					<Tooltip
						title={
							records.twins.length > 0
								? `Shared birthdays: ${records.twins
										.map((t) => t.join(" & "))
										.join(", ")}`
								: "No exact twins found yet!"
						}
					>
						<Statistic
							title="👯 Twins"
							value={records.twins.length}
							suffix="pairs"
							valueStyle={{ fontSize: "1em" }}
						/>
					</Tooltip>
				</Col>
			</Row>
		</Card>
	);
};
