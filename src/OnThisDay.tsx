import { Collapse, Flex, Skeleton, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface Event {
	year: string;
	text: string;
	pages: {
		titles: {
			normalized: string;
		};
		extract: string;
	}[];
}

interface OnThisDayProps {
	month: number;
	day: number;
}

export const OnThisDay = ({ month, day }: OnThisDayProps) => {
	const { t, i18n } = useTranslation();
	const [events, setEvents] = useState<Event[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);

	useEffect(() => {
		const fetchEvents = async () => {
			setLoading(true);
			setError(false);
			try {
				const mm = month.toString().padStart(2, "0");
				const dd = day.toString().padStart(2, "0");
				let lang = "en";
				if (i18n.language.startsWith("fr")) lang = "fr";
				else if (i18n.language.startsWith("es")) lang = "es";
				else if (i18n.language.startsWith("de")) lang = "de";
				else if (i18n.language.startsWith("zh")) lang = "zh";

				const res = await fetch(
					`https://api.wikimedia.org/feed/v1/wikipedia/${lang}/onthisday/selected/${mm}/${dd}`,
				);
				if (!res.ok) throw new Error("Failed to fetch");
				const data = await res.json();
				setEvents(data.selected.slice(0, 5));
			} catch (err) {
				console.error(err);
				setError(true);
			} finally {
				setLoading(false);
			}
		};

		fetchEvents();
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
