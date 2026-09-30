import { Avatar, Card, Flex, Text } from "@mantine/core";
import dayjs from "dayjs";
import { Cake } from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useCalendarDay } from "../hooks/useToday";
import { EmptyState } from "../shared";
import { birthdays } from "./birthdays";
import { KindIcon } from "./KindIcon";
import { dataStore } from "./store";

/**
 * Urgency scale for the "days left" figure. Deliberately quiet: this widget
 * sits under the hero, which already owns the loud countdown, so the only
 * thing that earns emphasis here is "it is today".
 */
type MilestoneUrgency = "today" | "soon" | "upcoming" | "distant";

const urgencyOf = (days: number): MilestoneUrgency => {
	if (days <= 0) return "today";
	if (days <= 7) return "soon";
	if (days <= 30) return "upcoming";
	return "distant";
};

const URGENCY_STYLE: Record<MilestoneUrgency, CSSProperties> = {
	today: { color: "var(--tk-accent-ink)" },
	soon: { color: "var(--tk-text)" },
	upcoming: { color: "var(--tk-text-dim)" },
	distant: { color: "var(--tk-text-faint)" },
};

/**
 * Locale-aware short date. `Intl` follows each language's field order, which
 * `dayjs().format("D MMM")` cannot.
 */
const shortDate = (date: Date, language: string): string => {
	try {
		return new Intl.DateTimeFormat(language, {
			day: "numeric",
			month: "short",
		}).format(date);
	} catch {
		return dayjs(date).format("D MMM");
	}
};

export const MilestonesWidget = () => {
	const { t, i18n } = useTranslation();

	// The milestone list is relative to today (a milestone whose day has
	// passed drops out), so it is derived on every render instead of being
	// memoised against a stale "today": subscribing to the calendar day
	// re-renders at midnight, which is exactly when the answer must change.
	useCalendarDay();

	const upcomingMilestones = birthdays
		.filter((b) => b.milestone && b.daysBeforeBirthday >= 0)
		.slice(0, 3);

	if (upcomingMilestones.length === 0) {
		return (
			<EmptyState
				icon={<Cake size={20} strokeWidth={1.5} />}
				title={t("app.milestones.title")}
				body={t("app.milestones.no_upcoming")}
			/>
		);
	}

	return (
		<Card withBorder style={{ marginTop: 16 }}>
			<Text fw={600} style={{ marginBottom: 8 }}>
				{t("app.milestones.title")}
			</Text>
			<Flex gap="lg" wrap="wrap" justify="center">
				{upcomingMilestones.map((item) => {
					const days = item.daysBeforeBirthday;
					const urgency = urgencyOf(days);
					return (
						<button
							type="button"
							key={`${item.name}-${item.birthdayString}`}
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
									size={28}
									style={{
										backgroundColor:
											urgency === "today"
												? "var(--tk-accent-soft)"
												: "var(--tk-surface-3)",
										color: "var(--tk-text-dim)",
									}}
								>
									<KindIcon kind={item.kind} size={14} />
								</Avatar>
								<Flex direction="column" flex={1}>
									<Text component="span" fw={600} style={{ fontSize: 14 }}>
										{item.name}
										{item.milestone
											? ` - ${t(item.milestone.key, item.milestone.params)}`
											: ""}
									</Text>

									<Text
										// Days remaining are the lead figure; the milestone
										// status below is metadata supporting it.
										component="span"
										style={{
											display: "flex",
											alignItems: "baseline",
											justifyContent: "center",
											gap: 5,
											fontVariantNumeric: "tabular-nums",
											...URGENCY_STYLE[urgency],
										}}
									>
										{urgency === "today" ? (
											t("app.milestones.today")
										) : (
											<>
												<span style={{ fontSize: 22, fontWeight: 700 }}>
													{days}
												</span>
												<span style={{ fontSize: 12 }}>{t("table.days")}</span>
											</>
										)}
									</Text>

									<Text c="dimmed" component="span" style={{ fontSize: 12 }}>
										{item.milestoneStatus
											? t(item.milestoneStatus.key, item.milestoneStatus.params)
											: shortDate(item.nextBirthday, i18n.language)}
									</Text>
								</Flex>
							</Flex>
						</button>
					);
				})}
			</Flex>
		</Card>
	);
};
