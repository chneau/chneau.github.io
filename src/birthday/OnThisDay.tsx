import { Accordion, Flex, Skeleton, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { dataStore, type WikiEvent } from "./store";

type OnThisDayProps = {
	month: number;
	day: number;
};

export const OnThisDay = ({ month, day }: OnThisDayProps) => {
	const { t, i18n } = useTranslation();
	const [events, setEvents] = useState<WikiEvent[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);

	useEffect(() => {
		const controller = new AbortController();
		const fetchEvents = async () => {
			const mm = month.toString().padStart(2, "0");
			const dd = day.toString().padStart(2, "0");
			const lang = i18n.language.slice(0, 2);
			const finalLang = ["en", "fr", "es", "de", "zh"].includes(lang)
				? lang
				: "en";
			const cacheKey = `${finalLang}-${mm}-${dd}`;

			if (dataStore.wikiCache[cacheKey]) {
				setEvents(dataStore.wikiCache[cacheKey] as WikiEvent[]);
				return;
			}

			setLoading(true);
			setError(false);
			try {
				const res = await fetch(
					`https://api.wikimedia.org/feed/v1/wikipedia/${finalLang}/onthisday/selected/${mm}/${dd}`,
					{ signal: controller.signal },
				);
				if (!res.ok) throw new Error("Failed to fetch");
				const data = await res.json();
				const selectedEvents: WikiEvent[] = data.selected
					.slice(0, 5)
					.map((e: WikiEvent) => ({
						year: e.year,
						text: e.text,
					}));
				dataStore.wikiCache[cacheKey] = selectedEvents;
				setEvents(selectedEvents);
			} catch (err) {
				if (err instanceof Error && err.name === "AbortError") return;
				console.error(err);
				setError(true);
			} finally {
				setLoading(false);
			}
		};

		fetchEvents();
		return () => controller.abort();
	}, [month, day, i18n.language]);

	if (error) {
		return (
			<div className="tk-error" role="alert" style={{ marginTop: 16 }}>
				<TriangleAlert size={16} strokeWidth={1.9} />
				<div>{t("app.on_this_day_error")}</div>
			</div>
		);
	}

	return (
		<Accordion
			variant="default"
			style={{
				marginTop: 16,
				background: "var(--tk-surface-2)",
				borderRadius: "8px",
			}}
			styles={{ item: { border: "none", background: "transparent" } }}
		>
			<Accordion.Item value="1">
				<Accordion.Control>
					<Text fw={600} component="span">
						📜 {t("on_this_day")} (
						{dayjs()
							.month(month - 1)
							.format("MMMM")}{" "}
						{day})
					</Text>
				</Accordion.Control>
				<Accordion.Panel>
					{loading ? (
						<Stack gap="xs">
							<Skeleton height={12} />
							<Skeleton height={12} />
							<Skeleton height={12} />
						</Stack>
					) : (
						<Flex direction="column" gap="md">
							{events.map((item) => (
								<Flex key={item.text} direction="column">
									<Text fw={600}>{item.year}</Text>
									<Text c="dimmed">{item.text}</Text>
								</Flex>
							))}
						</Flex>
					)}
				</Accordion.Panel>
			</Accordion.Item>
		</Accordion>
	);
};
