import { Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { getCompatibilityScore } from "./compatibility";

type CompatibilityMatrixProps = {
	data: readonly Birthday[];
};

const getScoreColor = (score: number) =>
	[
		{ limit: 90, color: "#52c41a" },
		{ limit: 80, color: "#a0d911" },
		{ limit: 50, color: "#faad14" },
	].find((s) => score >= s.limit)?.color || "#f5222d";

export const CompatibilityMatrix = ({ data }: CompatibilityMatrixProps) => {
	const { t } = useTranslation();
	// Filter out weddings for compatibility matrix to keep it clean, or keep them?
	// Let's keep only people (♂️, ♀️)
	const people = useMemo(() => data.filter((x) => x.kind !== "💒"), [data]);

	const columns: ColumnsType<Birthday> = useMemo(
		() => [
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
			...people.map((person): ColumnsType<Birthday>[number] => ({
				title: (
					<Tooltip
						title={`${person.name} (${t(`data.zodiac.${person.sign}`)})`}
					>
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
							title={`${record.name} & ${person.name}: ${score}% (${t(
								`data.elements.${record.element}`,
							)} + ${t(`data.elements.${person.element}`)})`}
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
			})),
		],
		[people, t],
	);
	return (
		<div style={{ marginTop: 16 }}>
			<div style={{ marginBottom: 16 }}>
				<Tag color="#52c41a">{t("app.compatibility.excellent")}</Tag>
				<Tag color="#a0d911">{t("app.compatibility.great")}</Tag>
				<Tag color="#faad14">{t("app.compatibility.neutral")}</Tag>
				<Tag color="#f5222d">{t("app.compatibility.challenging")}</Tag>
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
