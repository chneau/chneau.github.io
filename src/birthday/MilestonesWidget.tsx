import { Avatar, Card, Flex, Text } from "@mantine/core";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { birthdays } from "./birthdays";
import { KindIcon } from "./KindIcon";
import { dataStore } from "./store";

export const MilestonesWidget = () => {
	const { t } = useTranslation();
	const upcomingMilestones = useMemo(() => {
		return birthdays
			.filter((b) => b.milestone && b.daysBeforeBirthday >= 0)
			.slice(0, 3);
	}, []);

	if (upcomingMilestones.length === 0) return null;

	return (
		<Card withBorder style={{ marginTop: 16 }}>
			<Text fw={600} style={{ marginBottom: 8 }}>
				{t("app.milestones.title")}
			</Text>
			<Flex gap="lg" wrap="wrap" justify="center">
				{upcomingMilestones.map((item) => (
					<button
						type="button"
						key={item.name}
						style={{
							background: "none",
							border: "none",
							padding: 8,
							borderRadius: 8,
							cursor: "pointer",
							flex: "1 1 250px",
							textAlign: "center",
							transition: "background 0.2s",
						}}
						onClick={() => {
							dataStore.selectedBirthday = item;
						}}
					>
						<Flex gap="sm" align="center" direction="column">
							<Avatar
								style={{
									backgroundColor:
										item.daysBeforeBirthday === 0
											? "var(--tk-accent)"
											: "var(--tk-warn)",
									color: "#04150f",
								}}
							>
								<KindIcon kind={item.kind} size={16} />
							</Avatar>
							<Flex direction="column" flex={1}>
								<span>
									<Text component="span" fw={600} style={{ color: "#1677ff" }}>
										{item.name}
									</Text>
									{" - "}
									{item.milestone
										? t(item.milestone.key, item.milestone.params)
										: ""}
								</span>
								<Text c="dimmed">
									{item.daysBeforeBirthday === 0
										? t("app.milestones.today")
										: t("app.milestones.in_days", {
												days: item.daysBeforeBirthday,
												date: dayjs(item.birthday).format("D MMM"),
											})}
									{" • "}
									<Text component="span" c="dimmed" fs="italic">
										{item.milestoneStatus
											? t(item.milestoneStatus.key, item.milestoneStatus.params)
											: ""}
									</Text>
								</Text>
							</Flex>
						</Flex>
					</button>
				))}
			</Flex>
		</Card>
	);
};
