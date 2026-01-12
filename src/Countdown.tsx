import { Card, Statistic, Typography } from "antd";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";

dayjs.extend(duration);

type CountdownTimerProps = {
	birthday: Birthday;
};

const CountdownTimer = ({ birthday }: CountdownTimerProps) => {
	const { t } = useTranslation();
	const getDiff = () => {
		const target = dayjs(birthday.nextBirthday);
		const now = dayjs();
		const diff = target.diff(now);

		if (diff <= 0) {
			return { days: 0, hours: 0, minutes: 0, seconds: 0 };
		}

		const dur = dayjs.duration(diff);
		return {
			days: Math.floor(dur.asDays()),
			hours: dur.hours(),
			minutes: dur.minutes(),
			seconds: dur.seconds(),
		};
	};

	const [timeLeft, setTimeLeft] = useState(getDiff());

	useEffect(() => {
		const updateCountdown = () => {
			const target = dayjs(birthday.nextBirthday);
			const now = dayjs();
			const diff = target.diff(now);

			if (diff <= 0) {
				setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
				return;
			}

			const dur = dayjs.duration(diff);
			setTimeLeft({
				days: Math.floor(dur.asDays()),
				hours: dur.hours(),
				minutes: dur.minutes(),
				seconds: dur.seconds(),
			});
		};

		const timer = setInterval(updateCountdown, 1000);
		return () => clearInterval(timer);
	}, [birthday.nextBirthday]);

	return (
		<div style={{ textAlign: "center", flex: 1, minWidth: "200px" }}>
			<Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
				{t("app.countdown.next_celebration", {
					name: birthday.name,
					kind: birthday.kind,
				})}
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
		</div>
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
