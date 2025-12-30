import { Timeline, Typography } from "antd";
import type { Birthday } from "./birthdays";

export const TimelineView = ({ data }: { data: readonly Birthday[] }) => {
	return (
		<div style={{ padding: 16, maxHeight: 500, overflowY: "auto" }}>
			<Timeline
				items={data.map((x) => ({
					color:
						x.daysBeforeBirthday <= 7
							? "green"
							: x.daysBeforeBirthday <= 30
								? "blue"
								: "gray",
					label: (
						<Typography.Text type="secondary">
							{x.birthdayString.slice(5)} {/* Show MM-DD */}
						</Typography.Text>
					),
					children: (
						<Typography.Text>
							<strong>{x.name}</strong> will turn {x.age + 1} in{" "}
							{x.daysBeforeBirthday} days ({x.dayOfWeek})
						</Typography.Text>
					),
				}))}
				mode="left"
			/>
		</div>
	);
};
