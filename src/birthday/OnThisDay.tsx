import { Accordion, Flex, Skeleton, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { dataStore, type WikiEvent } from "./store";
import { WikiEventSchema, WikiEventsSchema } from "./wikiCache";

type OnThisDayProps = {
	month: number;
	day: number;
};

/**
 * The `onthisday/selected` payload.
 *
 * `WikiEventSchema` (from `wikiCache.ts`) already describes an item exactly —
 * `{ text, year, pages? }` — so it is reused rather than restated here, which
 * keeps the cached shape and the fetched shape from drifting apart.
 *
 * A missing `selected` key is a legitimate "nothing happened on this day"
 * answer, not a malformed payload, so it defaults to an empty list. Anything
 * present but of the wrong shape still fails the parse and surfaces through the
 * error path instead of a silently empty panel.
 */
const OnThisDayResponseSchema = z.object({
	selected: z.array(WikiEventSchema).default([]),
});

/** The API is only maintained for these Wikipedias. */
const SUPPORTED_LANGUAGES = ["en", "fr", "es", "de", "zh"];

const MAX_EVENTS = 5;

const resolveLanguage = (language: string): string => {
	const lang = language.slice(0, 2);
	return SUPPORTED_LANGUAGES.includes(lang) ? lang : "en";
};

/**
 * One day's answer, resolved.
 *
 * `events` is the list to render (`[]` while nothing is known yet), and
 * `loading` says whether the network is still the source of truth.
 */
type DayAnswer = {
	events: WikiEvent[];
	loading: boolean;
	error: boolean;
};

/**
 * Asks Wikimedia for one day and returns the events to render.
 *
 * Outside the effect on purpose: the effect then only wires a promise to state,
 * and the answer — cache hit, spinner, error or list — is decided during render
 * rather than arriving one frame late from inside an `await`.
 */
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

	// Two entries can share a year and a summary, so dedupe on the pair used as
	// the React key: without this the duplicate-key warning fires and one row is
	// dropped.
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

export const OnThisDay = ({ month, day }: OnThisDayProps) => {
	const { t, i18n } = useTranslation();

	// Resolved once and used for both the request URL and the attribution link,
	// so the credit always names the edition actually rendered.
	const finalLang = useMemo(
		() => resolveLanguage(i18n.language),
		[i18n.language],
	);

	const mm = month.toString().padStart(2, "0");
	const dd = day.toString().padStart(2, "0");
	const cacheKey = `${finalLang}-${mm}-${dd}`;

	/**
	 * Re-validated on the way out: the mirror is written by the cache, but a
	 * stale or hand-edited entry must degrade to a fresh fetch rather than
	 * render junk. This is read during render because the cache is already in
	 * memory — a cache hit is an answer, not a thing to wait for, so reading it
	 * in an effect would paint one frame of "nothing happened on this day"
	 * before showing the events.
	 */
	const cached = useMemo(() => {
		const parsed = WikiEventsSchema.safeParse(dataStore.wikiCache[cacheKey]);
		return parsed.success ? parsed.data : null;
	}, [cacheKey]);

	/**
	 * Only what the network answered, tagged with the day it answers. The tag is
	 * what lets the render below tell a resolved day from an unresolved one, so
	 * a stale answer for a previously viewed day is never shown for this one.
	 */
	const [fetched, setFetched] = useState<{
		cacheKey: string;
		answer: DayAnswer;
	} | null>(null);

	const answered = fetched !== null && fetched.cacheKey === cacheKey;
	const { events, loading, error } =
		answered && fetched
			? fetched.answer
			: cached
				? { events: cached, loading: false, error: false }
				: { events: [] as WikiEvent[], loading: true, error: false };

	useEffect(() => {
		// A valid mirror entry is already the rendered answer, so there is
		// nothing to fetch for this day.
		if (cached) return;

		const controller = new AbortController();
		fetchDay(finalLang, mm, dd, controller.signal)
			.then((selectedEvents) => {
				// Goes through the cache, which is what validates, bounds, ages
				// out and persists it. A payload it refuses is not cached.
				dataStore.wikiCache[cacheKey] = selectedEvents;
				setFetched({
					cacheKey,
					answer: { events: selectedEvents, loading: false, error: false },
				});
			})
			.catch((err: unknown) => {
				if (err instanceof Error && err.name === "AbortError") return;
				console.error(err);
				setFetched({
					cacheKey,
					answer: { events: [], loading: false, error: true },
				});
			});
		return () => controller.abort();
	}, [cacheKey, cached, finalLang, mm, dd]);

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

					{/* The Wikimedia API terms and CC BY-SA 4.0 both require visible
					    attribution, so this is deliberately outside the loading and
					    empty branches: it shows whenever the panel is open. */}
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
