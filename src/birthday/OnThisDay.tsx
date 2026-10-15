import { Accordion, Flex, Skeleton, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { dataStore, type WikiEvent } from "./store";
import { WikiEventSchema, WikiEventsSchema } from "./wikiCache";

type OnThisDayProps = {
	month: number;
	day: number;
};

const OnThisDayResponseSchema = z.object({
	selected: z.array(WikiEventSchema).default([]),
});

const SUPPORTED_LANGUAGES = ["en", "fr", "es", "de", "zh"];

const MAX_EVENTS = 5;

const resolveLanguage = (language: string): string => {
	const lang = language.slice(0, 2);
	return SUPPORTED_LANGUAGES.includes(lang) ? lang : "en";
};

const fetchDay = async (
	language: string,
	mm: string,
	dd: string,
	signal: AbortSignal,
): Promise<WikiEvent[]> => {
	const res = await fetch(
		`https://api.wikimedia.org/feed/v1/wikipedia/${language}/onthisday/selected/${mm}/${dd}`,
		{ signal },
	);
	if (!res.ok) throw new Error("Failed to fetch");
	const data: unknown = await res.json();
	const { selected } = OnThisDayResponseSchema.parse(data);

	const seen = new Set<string>();
	const selectedEvents: WikiEvent[] = [];
	for (const event of selected) {
		if (selectedEvents.length >= MAX_EVENTS) break;
		const text = event.text.trim();
		if (text.length === 0) continue;
		const key = `${event.year}:${text}`;
		if (seen.has(key)) continue;
		seen.add(key);
		selectedEvents.push({ year: event.year, text, pages: event.pages });
	}
	return selectedEvents;
};

const PANEL = "1";

type DayAnswer =
	| { cacheKey: string; status: "loading" }
	| { cacheKey: string; status: "resolved"; events: WikiEvent[] }
	| { cacheKey: string; status: "failed" };

export const OnThisDay = ({ month, day }: OnThisDayProps) => {
	const { t, i18n } = useTranslation();

	const finalLang = useMemo(
		() => resolveLanguage(i18n.language),
		[i18n.language],
	);

	const mm = month.toString().padStart(2, "0");
	const dd = day.toString().padStart(2, "0");
	const cacheKey = `${finalLang}-${mm}-${dd}`;

	const cached = useMemo(() => {
		const parsed = WikiEventsSchema.safeParse(dataStore.wikiCache[cacheKey]);
		return parsed.success ? parsed.data : null;
	}, [cacheKey]);

	const [opened, setOpened] = useState(false);
	const [answer, setAnswer] = useState<DayAnswer | null>(null);
	const inFlight = useRef<AbortController | null>(null);

	const ask = async (key: string) => {
		inFlight.current?.abort();
		const controller = new AbortController();
		inFlight.current = controller;
		setAnswer({ cacheKey: key, status: "loading" });
		try {
			const events = await fetchDay(finalLang, mm, dd, controller.signal);
			dataStore.wikiCache[key] = events;
			setAnswer({ cacheKey: key, status: "resolved", events });
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") return;
			console.error(`birthday/onthisday: could not fetch ${key}`, err);
			setAnswer({ cacheKey: key, status: "failed" });
		}
	};

	useEffect(() => () => inFlight.current?.abort(), []);

	const mine = answer?.cacheKey === cacheKey ? answer : null;
	const events = mine?.status === "resolved" ? mine.events : (cached ?? []);
	const loading = mine?.status === "loading";
	const error = mine?.status === "failed";

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
			value={opened ? PANEL : null}
			onChange={(value) => {
				const isOpen = value === PANEL;
				setOpened(isOpen);
				if (isOpen && cached === null) void ask(cacheKey);
			}}
			style={{
				marginTop: 16,
				background: "var(--tk-surface-2)",
				borderRadius: "8px",
			}}
			styles={{ item: { border: "none", background: "transparent" } }}
		>
			<Accordion.Item value={PANEL}>
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
					) : events.length === 0 ? (
						<Text c="dimmed" size="sm">
							{t("app.on_this_day_empty")}
						</Text>
					) : (
						<Flex direction="column" gap="md">
							{events.map((item) => {
								const source = item.pages?.[0];
								return (
									<Flex
										key={`${item.year}:${item.text}`}
										direction="column"
										gap={2}
									>
										<Text fw={600}>{item.year}</Text>
										<Text c="dimmed">{item.text}</Text>
										{source ? (
											<a
												href={source.url}
												target="_blank"
												rel="noreferrer noopener"
												style={{ fontSize: "12px", opacity: 0.8 }}
											>
												{t("app.on_this_day_source")}: {source.title}
											</a>
										) : null}
									</Flex>
								);
							})}
						</Flex>
					)}

					<Text size="xs" c="dimmed" mt="sm">
						{t("app.on_this_day_attribution")}{" "}
						<a
							href={`https://${finalLang}.wikipedia.org/`}
							target="_blank"
							rel="noreferrer noopener"
						>
							{t("app.on_this_day_attribution_wikipedia")}
						</a>{" "}
						<a
							href="https://creativecommons.org/licenses/by-sa/4.0/"
							target="_blank"
							rel="noreferrer noopener"
						>
							{t("app.on_this_day_attribution_license")}
						</a>
					</Text>
				</Accordion.Panel>
			</Accordion.Item>
		</Accordion>
	);
};
