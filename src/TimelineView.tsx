import { Timeline, Typography } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";

export const TimelineView = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
	return (
		<div style={{ padding: "16px 0", maxHeight: 500, overflowY: "auto" }}>
			<Timeline
				items={data.map((x) => ({
					color:
						[
							{ d: 0, c: "red" },
							{ d: 7, c: "green" },
							{ d: 30, c: "blue" },
						].find((c) => x.daysBeforeBirthday <= c.d)?.c || "gray",
					title: (
						<Typography.Text
							type="secondary"
							style={{ width: 80, display: "inline-block" }}
						>
							{x.birthdayString.slice(5)}
						</Typography.Text>
					),
					content: (
						<div>
							<Typography.Text strong>{x.name}</Typography.Text>
							<br />
							<Typography.Text type="secondary" style={{ fontSize: "0.85em" }}>
								{x.kind === "💒"
									? t("app.timeline.anniversary")
									: t("app.timeline.turns", { age: x.age + 1 })}{" "}
								{t("app.timeline.in_days", {
									days: x.daysBeforeBirthday,
									day: dayjs(x.birthday).format("dddd"),
								})}
							</Typography.Text>
						</div>
					),
				}))}
				mode="start"
			/>
		</div>
	);
};
