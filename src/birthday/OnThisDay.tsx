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

/** The value the accordion is given for this panel's one item. */
const PANEL = "1";

/**
 * Where one day's answer has got to.
 *
 * Tagged with the day it answers, so a resolved day is never mistaken for an
 * unresolved one: a stale answer for a previously viewed day must not be shown
 * for the day now on screen.
 */
type DayAnswer =
	| { cacheKey: string; status: "loading" }
	| { cacheKey: string; status: "resolved"; events: WikiEvent[] }
	| { cacheKey: string; status: "failed" };

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
	 * from an effect would paint one frame of "nothing happened on this day"
	 * before showing the events.
	 */
	const cached = useMemo(() => {
		const parsed = WikiEventsSchema.safeParse(dataStore.wikiCache[cacheKey]);
		return parsed.success ? parsed.data : null;
	}, [cacheKey]);

	const [opened, setOpened] = useState(false);
	const [answer, setAnswer] = useState<DayAnswer | null>(null);
	const inFlight = useRef<AbortController | null>(null);

	/**
	 * Ask Wikimedia for this day.
	 *
	 * Called from the panel's own open event rather than from an effect on
	 * mount. The panel starts collapsed and shows nothing until it is opened, so
	 * a request fired on mount is a request for content nobody has asked to see
	 * — and the accordion click is the event that says they want it. Anything
	 * already in flight is aborted first, so clicking through several days
	 * leaves one answer standing instead of several racing to set state.
	 *
	 * The cache write goes through the store, which is what validates, bounds,
	 * ages out and persists the payload; one it refuses is not cached.
	 */
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
			// The day changed or the panel went away: there is nobody left to
			// show an answer to, and it is not a failure to report.
			if (err instanceof Error && err.name === "AbortError") return;
			console.error(err);
			setAnswer({ cacheKey: key, status: "failed" });
		}
	};

	/**
	 * A panel that goes away abandons its request. Nothing else cancels one,
	 * because nothing else starts one.
	 */
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
			/**
			 * Opening the panel is the event that asks for the day. A valid
			 * mirror entry is already the answer, so there is nothing to fetch
			 * for that day — and the cache is written by `ask`, so the second
			 * open of the same day is a hit too.
			 */
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
