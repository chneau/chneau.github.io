import { Avatar, Card, Flex, Typography } from "antd";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { birthdays } from "./birthdays";
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
		<Card
			title={t("app.milestones.title")}
			size="small"
			style={{ marginTop: 16 }}
		>
			<Flex gap="large" wrap="wrap" justify="center">
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
						<Flex gap="small" align="center" vertical>
							<Avatar
								style={{
									backgroundColor:
										item.daysBeforeBirthday === 0 ? "#f5222d" : "#faad14",
								}}
							>
								{item.kind}
							</Avatar>
							<Flex vertical flex={1}>
								<span>
									<Typography.Text strong style={{ color: "#1677ff" }}>
										{item.name}
									</Typography.Text>
									{" - "}
									{item.milestone
										? t(item.milestone.key, item.milestone.params)
										: ""}
								</span>
								<Typography.Text type="secondary">
									{item.daysBeforeBirthday === 0
										? t("app.milestones.today")
										: t("app.milestones.in_days", {
												days: item.daysBeforeBirthday,
												date: dayjs(item.birthday).format("D MMM"),
											})}
									{" • "}
									<Typography.Text type="secondary" italic>
										{item.milestoneStatus
											? t(item.milestoneStatus.key, item.milestoneStatus.params)
											: ""}
									</Typography.Text>
								</Typography.Text>
							</Flex>
						</Flex>
					</button>
				))}
			</Flex>
		</Card>
	);
};
