import { Timeline, Typography } from "antd";
import type { Birthday } from "./birthdays";

export const TimelineView = ({ data }: { data: readonly Birthday[] }) => {
	return (
		<div style={{ padding: "16px 0", maxHeight: 500, overflowY: "auto" }}>
			<Timeline
				items={data.map((x) => ({
					color:
						x.daysBeforeBirthday === 0
							? "red"
							: x.daysBeforeBirthday <= 7
								? "green"
								: x.daysBeforeBirthday <= 30
									? "blue"
									: "gray",
					label: (
						<Typography.Text
							type="secondary"
							style={{ width: 80, display: "inline-block" }}
						>
							{x.birthdayString.slice(5)}
						</Typography.Text>
					),
					children: (
						<div>
							<Typography.Text strong>{x.name}</Typography.Text>
							<br />
							<Typography.Text type="secondary" style={{ fontSize: "0.85em" }}>
								{x.isWedding ? "Anniversary" : `Turns ${x.age + 1}`} in{" "}
								{x.daysBeforeBirthday} days ({x.dayOfWeek})
							</Typography.Text>
						</div>
					),
				}))}
				mode="left"
			/>
		</div>
	);
};
