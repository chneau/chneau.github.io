import { Card, Statistic, Tag, Typography } from "antd";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { dataStore } from "./store";

dayjs.extend(duration);

type CountdownTimerProps = {
	birthday: Birthday;
};

const CountdownTimer = ({ birthday }: CountdownTimerProps) => {
	const { t } = useTranslation();
	const getDiff = useCallback(() => {
		const isToday = birthday.daysBeforeBirthday === 0;
		const target = isToday
			? dayjs(birthday.nextBirthday).endOf("day")
			: dayjs(birthday.nextBirthday);
		const diff = target.diff(dayjs());
		if (diff <= 0) {
			return { isToday, days: 0, hours: 0, minutes: 0, seconds: 0 };
		}
		const dur = dayjs.duration(diff);
		return {
			isToday,
			days: Math.floor(dur.asDays()),
			hours: dur.hours(),
			minutes: dur.minutes(),
			seconds: dur.seconds(),
		};
	}, [birthday.nextBirthday, birthday.daysBeforeBirthday]);

	const [timeLeft, setTimeLeft] = useState(getDiff());

	useEffect(() => {
		const timer = setInterval(() => setTimeLeft(getDiff()), 1000);
		return () => clearInterval(timer);
	}, [getDiff]);

	return (
		<button
			type="button"
			style={{
				textAlign: "center",
				flex: 1,
				minWidth: "200px",
				cursor: "pointer",
				padding: "6px 12px",
				borderRadius: 8,
				transition: "background 0.2s",
				background: "none",
				border: "none",
			}}
			onClick={() => {
				dataStore.selectedBirthday = birthday;
			}}
		>
			<Typography.Text
				strong
				style={{ display: "block", marginBottom: 8, color: "#1677ff" }}
			>
				{t("app.countdown.next_celebration", {
					name: birthday.name,
					kind: birthday.kind,
				})}
				{timeLeft.isToday && (
					<Tag color="red" style={{ marginLeft: 8 }}>
						🎉 {t("app.milestones.today")}
					</Tag>
				)}
			</Typography.Text>
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					gap: "12px",
				}}
			>
				<Statistic
					title={t("app.countdown.days")}
					value={timeLeft.days}
					styles={{ content: { fontSize: "1.2rem" } }}
				/>
				<Statistic
					title={t("app.countdown.hours")}
					value={timeLeft.hours}
					styles={{ content: { fontSize: "1.2rem" } }}
				/>
				<Statistic
					title={t("app.countdown.mins")}
					value={timeLeft.minutes}
					styles={{ content: { fontSize: "1.2rem" } }}
				/>
				<Statistic
					title={t("app.countdown.secs")}
					value={timeLeft.seconds}
					styles={{ content: { fontSize: "1.2rem" } }}
				/>
			</div>
		</button>
	);
};

type CountdownProps = {
	birthdays: Birthday[];
};

export const Countdown = ({ birthdays }: CountdownProps) => {
	if (birthdays.length === 0) return null;

	return (
		<Card
			size="small"
			style={{
				marginBottom: 16,
				background: "rgba(24, 144, 255, 0.1)",
			}}
		>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: "24px",
					justifyContent: "space-around",
					padding: "8px 0",
				}}
			>
				{birthdays.map((b) => (
					<CountdownTimer key={`${b.name}-${b.birthdayString}`} birthday={b} />
				))}
			</div>
		</Card>
	);
};
