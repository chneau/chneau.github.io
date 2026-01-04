import { Avatar, Card, List, Typography } from "antd";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { birthdays } from "./birthdays";

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
			<List
				itemLayout="horizontal"
				dataSource={upcomingMilestones}
				renderItem={(item) => (
					<List.Item>
						<List.Item.Meta
							avatar={
								<Avatar
									style={{
										backgroundColor:
											item.daysBeforeBirthday === 0 ? "#f5222d" : "#faad14",
									}}
								>
									{item.kind}
								</Avatar>
							}
							title={
								<span>
									<Typography.Text strong>{item.name}</Typography.Text>
									{" - "}
									{item.milestone
										? t(item.milestone.key, item.milestone.params)
										: ""}
								</span>
							}
							description={
								<span>
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
								</span>
							}
						/>
					</List.Item>
				)}
			/>
		</Card>
	);
};
