import { Card, Statistic, Typography } from "antd";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { useEffect, useState } from "react";
import type { Birthday } from "./birthdays";

dayjs.extend(duration);

type CountdownProps = {
	nextBirthday: Birthday;
};

export const Countdown = ({ nextBirthday }: CountdownProps) => {
	const [timeLeft, setTimeLeft] = useState<{
		days: number;
		hours: number;
		minutes: number;
		seconds: number;
	} | null>(null);

	useEffect(() => {
		const target = dayjs(nextBirthday.nextBirthday);

		const updateCountdown = () => {
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

		updateCountdown();
		const timer = setInterval(updateCountdown, 1000);

		return () => clearInterval(timer);
	}, [nextBirthday]);

	if (!timeLeft) return null;

	return (
		<Card
			size="small"
			style={{
				marginBottom: 16,
				textAlign: "center",
				background: "rgba(24, 144, 255, 0.1)",
			}}
		>
			<Typography.Text strong>
				Next Celebration: {nextBirthday.name} ({nextBirthday.kind})
			</Typography.Text>
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					gap: "16px",
					marginTop: "8px",
				}}
			>
				<Statistic title="Days" value={timeLeft.days} />
				<Statistic title="Hours" value={timeLeft.hours} />
				<Statistic title="Mins" value={timeLeft.minutes} />
				<Statistic title="Secs" value={timeLeft.seconds} />
			</div>
		</Card>
	);
};
