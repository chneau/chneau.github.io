import { Text, Title } from "@mantine/core";
import { Clock, Command } from "lucide-react";
import { APPS, Stat, StatusDot } from "../shared";

declare const BUILD_DATE: string;

const GREETINGS = ["Good morning", "Good afternoon", "Good evening"] as const;

const greetingFor = (date: Date) => {
	const hour = date.getHours();
	if (hour < 12) return GREETINGS[0];
	if (hour < 18) return GREETINGS[1];
	return GREETINGS[2];
};

type DashboardHeroProps = {
	/** Current time, refreshed on a timer by the dashboard. */
	now: Date;
};

/** The greeting, date and headline stats above the toolbar. */
export const DashboardHero = ({ now }: DashboardHeroProps) => (
	<section className="app-hero">
		<span className="app-hero__eyebrow">
			<StatusDot label="Everything runs in your browser" />
			{greetingFor(now)} ·{" "}
			{now.toLocaleDateString(undefined, {
				weekday: "long",
				day: "numeric",
				month: "long",
			})}
		</span>
		<Title order={1}>Small tools, thoughtfully built.</Title>
		<Text className="app-hero__lede">
			A collection of interactive web apps, data visualisations and client-side
			tools. Everything runs in your browser — nothing is uploaded.
		</Text>
		<div className="app-hero__stats">
			<Stat label="Apps" value={APPS.length} hint="and counting" />
			<Stat
				label="Privacy"
				value="Opt-in analytics"
				icon={<Command size={13} />}
			/>
			<Stat label="Last build" value={BUILD_DATE} icon={<Clock size={13} />} />
		</div>
	</section>
);
