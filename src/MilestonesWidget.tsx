import { Avatar, Card, List, Typography } from "antd";
import { useMemo } from "react";
import { birthdays } from "./birthdays";

export const MilestonesWidget = () => {
	const upcomingMilestones = useMemo(() => {
		return birthdays
			.filter((b) => b.milestone && b.daysBeforeBirthday >= 0)
			.slice(0, 3);
	}, []);

	if (upcomingMilestones.length === 0) return null;

	return (
		<Card
			title="Upcoming Big Milestones 🎯"
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
								<Typography.Text strong>
									{item.name} is turning{" "}
									{item.milestone?.replace("Big ", "").replace("! 🎉", "")}
								</Typography.Text>
							}
							description={
								<span>
									{item.daysBeforeBirthday === 0
										? "Today! 🎉"
										: `In ${item.daysBeforeBirthday} days (${item.birthdayString.slice(
												5,
											)})`}
									{" • "}
									<Typography.Text type="secondary" italic>
										{item.milestoneStatus}
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
