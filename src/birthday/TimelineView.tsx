import { Text, Timeline } from "@mantine/core";
import dayjs from "dayjs";
import { CalendarClock, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../shared";
import type { Birthday } from "./birthdays";
import { KindIcon } from "./KindIcon";
import { dataStore, store } from "./store";

/** Urgency buckets used for both the timeline dots and the legend. */
const URGENCY = [
	{ key: "today", color: "red", maxDays: 0 },
	{ key: "week", color: "green", maxDays: 7 },
	{ key: "month", color: "blue", maxDays: 30 },
	{ key: "later", color: "gray", maxDays: Number.POSITIVE_INFINITY },
] as const;

const getUrgencyColor = (daysBeforeBirthday: number): string =>
	URGENCY.find((bucket) => daysBeforeBirthday <= bucket.maxDays)?.color ??
	"gray";

export const TimelineView = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();

	const handleResetFilters = () => {
		store.search = "";
		store.showBoys = true;
		store.showGirls = true;
		store.showWeddings = false;
	};

	if (data.length === 0) {
		return (
			<EmptyState
				icon={<CalendarClock size={20} strokeWidth={1.5} />}
				title={t("app.list.empty_title")}
				body={t("app.list.empty_body")}
				action={
					<button
						type="button"
						className="tk-iconbtn"
						onClick={handleResetFilters}
					>
						<RotateCcw size={14} strokeWidth={1.9} />
						{t("app.list.reset")}
					</button>
				}
			/>
		);
	}

	return (
		<div style={{ padding: "16px 0", maxHeight: 500, overflowY: "auto" }}>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 12,
					alignItems: "center",
					padding: "0 0 12px",
					fontSize: 12,
					color: "var(--tk-text-dim)",
				}}
			>
				{URGENCY.map((bucket) => (
					<span
						key={bucket.key}
						style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
					>
						<span
							aria-hidden="true"
							style={{
								width: 8,
								height: 8,
								borderRadius: 999,
								background: `var(--mantine-color-${bucket.color}-6)`,
							}}
						/>
						{t(`app.timeline.legend.${bucket.key}`)}
					</span>
				))}
			</div>
			<Timeline>
				{data.map((x) => (
					<Timeline.Item
						key={x.name}
						color={getUrgencyColor(x.daysBeforeBirthday)}
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
