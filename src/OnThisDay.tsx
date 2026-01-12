import { Collapse, Flex, Skeleton, Typography } from "antd";
import dayjs from "dayjs";
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
			const supportedLangs = ["en", "fr", "es", "de", "zh"];
			const finalLang = supportedLangs.includes(lang) ? lang : "en";
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
					.map((e: { year: number; text: string }) => ({
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

	if (error) return null;

	const items = [
		{
			key: "1",
			label: (
				<Typography.Text strong>
					📜 {t("on_this_day")} (
					{dayjs()
						.month(month - 1)
						.format("MMMM")}{" "}
					{day})
				</Typography.Text>
			),
			children: loading ? (
				<Skeleton active paragraph={{ rows: 3 }} />
			) : (
				<Flex vertical gap="middle">
					{events.map((item) => (
						<Flex key={item.text} vertical>
							<Typography.Text strong>{item.year}</Typography.Text>
							<Typography.Text type="secondary">{item.text}</Typography.Text>
						</Flex>
					))}
				</Flex>
			),
		},
	];

	return (
		<Collapse
			ghost
			size="small"
			items={items}
			style={{
				marginTop: 16,
				background: "rgba(0, 0, 0, 0.02)",
				borderRadius: "8px",
			}}
		/>
	);
};
