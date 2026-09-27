import { Text, Timeline } from "@mantine/core";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { KindIcon } from "./KindIcon";
import { dataStore } from "./store";

export const TimelineView = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
	return (
		<div style={{ padding: "16px 0", maxHeight: 500, overflowY: "auto" }}>
			<Timeline>
				{data.map((x) => (
					<Timeline.Item
						key={x.name}
						color={
							[
								{ d: 0, c: "red" },
								{ d: 7, c: "green" },
								{ d: 30, c: "blue" },
							].find((c) => x.daysBeforeBirthday <= c.d)?.c || "gray"
						}
						title={
							<Text c="dimmed" style={{ width: 80, display: "inline-block" }}>
								{x.birthdayString.slice(5)}
							</Text>
						}
					>
						<button
							type="button"
							style={{
								cursor: "pointer",
								padding: "4px 8px",
								borderRadius: 6,
								display: "inline-block",
								transition: "background 0.2s",
								background: "none",
								border: "none",
								textAlign: "left",
							}}
							onClick={() => {
								dataStore.selectedBirthday = x;
							}}
						>
							<Text fw={600} style={{ color: "#1677ff" }}>
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
									}}
								>
									<KindIcon kind={x.kind} size={12} />
									{x.name}
								</span>
							</Text>
							<br />
							<Text c="dimmed" style={{ fontSize: "0.85em" }}>
								{x.kind === "💒"
									? t("app.timeline.anniversary")
									: t("app.timeline.turns", { age: x.age + 1 })}{" "}
								{t("app.timeline.in_days", {
									days: x.daysBeforeBirthday,
									day: dayjs(x.birthday).format("dddd"),
								})}
							</Text>
						</button>
					</Timeline.Item>
				))}
			</Timeline>
		</div>
	);
};
