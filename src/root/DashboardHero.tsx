import { Text, Title } from "@mantine/core";

export const DashboardHero = () => (
	<section className="app-hero">
		<Title order={1}>Small tools, thoughtfully built.</Title>
		<Text className="app-hero__lede">
			A collection of interactive web apps, data visualisations and client-side
			tools. Everything runs in your browser — nothing is uploaded.
		</Text>
	</section>
);
