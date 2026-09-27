import { Badge, Box, Group, Table, Tooltip } from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { getCompatibilityScore, getScoreColor } from "./compatibility";
import { dataStore } from "./store";

type CompatibilityMatrixProps = {
	data: readonly Birthday[];
};

type PersonButtonProps = {
	person: Birthday;
	label: string;
	color?: string;
	onClick: () => void;
};

const PersonButton = ({ person, label, color, onClick }: PersonButtonProps) => (
	<button
		type="button"
		style={{
			background: "none",
			border: "none",
			padding: 0,
			cursor: "pointer",
			color,
			textAlign: "left",
			fontSize: "0.8em",
			fontWeight: "bold",
		}}
		onClick={onClick}
	>
		{label} {person.signSymbol}
	</button>
);

export const CompatibilityMatrix = ({ data }: CompatibilityMatrixProps) => {
	const { t } = useTranslation();
	const people = useMemo(() => data.filter((x) => x.kind !== "💒"), [data]);

	return (
		<div style={{ marginTop: 16 }}>
			<Group mb="md" gap="xs">
				<Badge variant="light" color="green">
					{t("app.compatibility.excellent")}
				</Badge>
				<Badge variant="light" color="lime">
					{t("app.compatibility.great")}
				</Badge>
				<Badge variant="light" color="yellow">
					{t("app.compatibility.neutral")}
				</Badge>
				<Badge variant="light" color="red">
					{t("app.compatibility.challenging")}
				</Badge>
			</Group>

			<Box style={{ maxHeight: 500, overflow: "auto" }}>
				<Table.ScrollContainer minWidth={110 + people.length * 60}>
					<Table className="tk-table" highlightOnHover>
						<Table.Thead>
							<Table.Tr>
								<Table.Th style={{ width: 110 }} />
								{people.map((person) => (
									<Table.Th
										key={person.name}
										style={{ width: 60, textAlign: "center" }}
									>
										<Tooltip
											label={`${person.name} (${t(
												`data.zodiac.${person.sign}`,
											)}) — Click to view details`}
										>
											<button
												type="button"
												style={{
													background: "none",
													border: "none",
													padding: 0,
													cursor: "pointer",
													color: "inherit",
													fontSize: "0.8em",
												}}
												onClick={() => {
													dataStore.selectedBirthday = person;
												}}
											>
												{person.name.slice(0, 3)}. {person.signSymbol}
											</button>
										</Tooltip>
									</Table.Th>
								))}
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{people.map((record) => (
								<Table.Tr key={record.name}>
									<Table.Td>
										<PersonButton
											person={record}
											label={record.name}
											color="var(--mantine-primary-color-filled)"
											onClick={() => {
												dataStore.selectedBirthday = record;
											}}
										/>
									</Table.Td>
									{people.map((person) => {
										const score = getCompatibilityScore(record, person);
										return (
											<Table.Td
												key={person.name}
												style={{ textAlign: "center", padding: 2 }}
											>
												<Tooltip
													label={`${record.name} & ${person.name}: ${score}% (${t(
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
											</Table.Td>
										);
									})}
								</Table.Tr>
							))}
						</Table.Tbody>
					</Table>
				</Table.ScrollContainer>
			</Box>
		</div>
	);
};
