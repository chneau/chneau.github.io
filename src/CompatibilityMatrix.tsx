import { Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import type { Birthday } from "./birthdays";
import { getCompatibilityScore } from "./compatibility";

interface CompatibilityMatrixProps {
	data: readonly Birthday[];
}

const getScoreColor = (score: number) => {
	if (score >= 90) return "#f5222d";
	if (score >= 80) return "#fa8c16";
	if (score >= 50) return "#52c41a";
	return "#bfbfbf";
};

export const CompatibilityMatrix = ({ data }: CompatibilityMatrixProps) => {
	// Filter out weddings for compatibility matrix to keep it clean, or keep them?
	// Let's keep only people (♂️, ♀️)
	const people = useMemo(() => data.filter((x) => x.kind !== "💒"), [data]);

	const columns: ColumnsType<Birthday> = useMemo(() => {
		const cols: ColumnsType<Birthday> = [
			{
				title: "",
				dataIndex: "name",
				key: "name",
				fixed: "left",
				width: 100,
				render: (name, record) => (
					<strong style={{ fontSize: "0.8em" }}>
						{name} {record.signSymbol}
					</strong>
				),
			},
		];

		for (const person of people) {
			cols.push({
				title: (
					<Tooltip title={`${person.name} (${person.sign})`}>
						<span style={{ fontSize: "0.8em" }}>
							{person.name.slice(0, 3)}. {person.signSymbol}
						</span>
					</Tooltip>
				),
				key: person.name,
				align: "center",
				width: 60,
				render: (_, record) => {
					const score = getCompatibilityScore(record, person);
					return (
						<Tooltip
							title={`${record.name} & ${person.name}: ${score}% (${record.element} + ${person.element})`}
						>
							<div
								style={{
									backgroundColor: getScoreColor(score),
									color: "white",
									borderRadius: "4px",
									fontSize: "0.75em",
									padding: "4px 0",
									cursor: "help",
								}}
							>
								{score}%
							</div>
						</Tooltip>
					);
				},
			});
		}

		return cols;
	}, [people]);

	return (
		<div style={{ marginTop: 16 }}>
			<div style={{ marginBottom: 16 }}>
				<Tag color="#f5222d">Excellent (100%)</Tag>
				<Tag color="#fa8c16">Great (80%)</Tag>
				<Tag color="#52c41a">Neutral (50%)</Tag>
				<Tag color="#bfbfbf">Challenging (40%)</Tag>
			</div>
			<Table
				key={people.map((p) => p.name).join(",")}
				dataSource={[...people]}
				columns={columns}
				pagination={false}
				size="small"
				scroll={{ x: "max-content", y: 500 }}
				rowKey="name"
			/>
		</div>
	);
};
