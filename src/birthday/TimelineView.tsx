import { Text, Timeline } from "@mantine/core";
import dayjs from "dayjs";
import { CalendarClock, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCalendarDay } from "../hooks/useToday";
import { EmptyState } from "../shared";
import type { Birthday } from "./birthdays";
import { getKindColor } from "./birthdays";
import { formatDate } from "./dates";
import { KindIcon, kindLabelKey } from "./KindIcon";
import { dataStore, resetFilters } from "./store";
import { groupByBucket } from "./timeline-buckets";

const KINDS = ["♂️", "♀️", "💒"] as const satisfies readonly Birthday["kind"][];

// Re-exported for the existing importers; the bucketing is a pure pass over a
// list and lives in `timeline-buckets.ts` so it is testable without a render.
export { bucketOf, groupByBucket } from "./timeline-buckets";

export const TimelineView = ({ data }: { data: readonly Birthday[] }) => {
	const { t, i18n } = useTranslation();

	// The buckets are relative to today, so a tab left open overnight must not
	// keep showing yesterday's "Today". Subscribing to the calendar day
	// re-renders at midnight, which is exactly when the grouping must change;
	// `groupByBucket` is a linear pass over the list, so it is cheap enough to
	// re-run inline rather than memoising a value nothing else feeds.
	useCalendarDay();

	const buckets = groupByBucket(data);

	const handleResetFilters = () => {
		resetFilters();
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
		// The scroll container is focusable on purpose (WCAG 2.1.1: a scrollable
		// region that cannot take focus is unreachable by keyboard). A named
		// `<section>` is the announced scrollable landmark, and the shared CSS
		// draws a focus ring on it, so the extra tab stop costs nothing.
		<section
			// biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG 2.1.1 - the list scrolls, so it has to be focusable to be scrolled by keyboard.
			tabIndex={0}
			aria-label={t("app.timeline.title")}
			style={{
				padding: "16px 0",
				maxHeight: 500,
				overflowY: "auto",
			}}
		>
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
				{KINDS.map((kind) => (
					<span
						key={kind}
						style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
					>
						<KindIcon kind={kind} size={12} />
						{t(kindLabelKey(kind))}
					</span>
				))}
			</div>

			{buckets.map((bucket) => {
				const isToday = bucket.key === "today";
				return (
					<section
						key={bucket.key}
						aria-labelledby={`timeline-bucket-${bucket.key}`}
						style={{ marginBottom: 18 }}
					>
						<Text
							component="h3"
							id={`timeline-bucket-${bucket.key}`}
							fw={600}
							size={isToday ? "md" : "sm"}
							style={{
								color: isToday ? "var(--tk-accent-ink)" : "var(--tk-text-dim)",
								letterSpacing: isToday ? "-0.01em" : undefined,
								textTransform: isToday ? "none" : "uppercase",
								fontSize: isToday ? undefined : 11,
								display: "flex",
								alignItems: "baseline",
								gap: 8,
								marginBottom: 8,
							}}
						>
							{t(`app.timeline.legend.${bucket.key}`)}
							<span
								aria-hidden="true"
								style={{
									fontWeight: 400,
									opacity: 0.7,
									fontVariantNumeric: "tabular-nums",
								}}
							>
								{bucket.items.length}
							</span>
						</Text>
						<Timeline bulletSize={isToday ? 22 : 18}>
							{bucket.items.map((x) => (
								<Timeline.Item
									key={`${x.name}-${x.birthdayString}`}
									color={getKindColor(x.kind)}
									title={
										<Text c="dimmed" component="span" style={{ fontSize: 12 }}>
											{formatDate(
												x.nextBirthday,
												i18n.language,
												{ weekday: "short", day: "numeric", month: "short" },
												dayjs(x.nextBirthday).format("ddd D MMM"),
											)}
										</Text>
									}
								>
									<button
										type="button"
										style={{
											display: "block",
											width: "100%",
											padding: "4px 8px",
											borderRadius: 6,
											textAlign: "left",
											background: isToday ? "var(--tk-accent-soft)" : "none",
											border: "none",
											color: "inherit",
											font: "inherit",
											cursor: "pointer",
										}}
										onClick={() => {
											dataStore.selectedBirthday = x;
										}}
									>
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 6,
											}}
										>
											<KindIcon kind={x.kind} size={12} />
											<Text component="span" fw={600}>
												{x.name}
											</Text>
										</span>
										<Text
											c="dimmed"
											component="span"
											style={{ fontSize: "0.85em" }}
										>
											{x.kind === "💒"
												? t("app.timeline.anniversary")
												: t("app.timeline.turns", { age: x.age + 1 })}{" "}
											{x.daysBeforeBirthday === 0
												? t("app.timeline.today")
												: t("app.timeline.in_days", {
														days: x.daysBeforeBirthday,
														day: formatDate(
															x.nextBirthday,
															i18n.language,
															{ weekday: "long" },
															dayjs(x.nextBirthday).format("dddd"),
														),
													})}
										</Text>
									</button>
								</Timeline.Item>
							))}
						</Timeline>
					</section>
				);
			})}
		</section>
	);
};
