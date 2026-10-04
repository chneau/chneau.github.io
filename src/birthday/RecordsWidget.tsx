import { Card, SimpleGrid, Text, Tooltip } from "@mantine/core";
import { Baby, Crown, HeartHandshake, Users } from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday, Element } from "./birthdays";
import { getCompatibilityScore } from "./compatibility";
import { dataStore } from "./store";

/**
 * The zodiac elements the scorer knows about.
 *
 * `Element` is derived from `locales/en.json`, so a new element added there
 * would silently drop out of the pair matrix without a compile error here -
 * `ELEMENT_FLAGS`'s `Record<Element, true>` annotation is what forces the
 * list to be updated at the same time.
 */
const ELEMENT_FLAGS: Record<Element, true> = {
	fire: true,
	earth: true,
	air: true,
	water: true,
};

const ELEMENTS = Object.keys(ELEMENT_FLAGS) as Element[];

const pairKey = (a: Element, b: Element) => `${a}|${b}`;

/**
 * `getCompatibilityScore` reads only `element` off both records, so the whole
 * dataset only ever contains `ELEMENTS.length ** 2` distinct answers. They are
 * cached for the lifetime of this module: `computeRecords` used to call the
 * scorer once per *pair of people* on every recompute - 900 calls for 30
 * people - and now makes at most 16 calls per page load.
 */
const pairScoreCache = new Map<string, number>();

/**
 * Counters proving the collapse works. Read by the tests; harmless in
 * production because nothing else touches them.
 */
export const recordsDiagnostics = {
	/** Full scans of the people list (one per `computeRecords` call). */
	computations: 0,
	/** Actual `getCompatibilityScore` invocations. */
	scorerCalls: 0,
	/** Distinct element pairs measured (capped at `ELEMENTS.length ** 2`). */
	pairScores: 0,
};

/**
 * The only place the scorer is reached. Split out so every call is counted:
 * the point of the cache is that this stays flat in the number of people.
 */
const scorePair = (left: Birthday, right: Birthday): number => {
	recordsDiagnostics.scorerCalls += 1;
	return getCompatibilityScore(left, right);
};

/**
 * Elements that score a perfect 100 against `element`, resolved from a pair
 * of *differently named* people.
 *
 * The scorer short-circuits to 100 for two identical names, so measuring an
 * element pair with a single person twice would poison the cache. When the
 * family genuinely has no differently named pair to measure with (one person,
 * or an element represented only by a shared name) the pair is reported as
 * unknown rather than guessed, and the socialite simply has no match there.
 */
const perfectElementsCache = new Map<Element, ReadonlySet<Element>>();

type PeopleByElement = ReadonlyMap<Element, readonly Birthday[]>;

const getPerfectElements = (
	element: Element,
	peopleByElement: PeopleByElement,
): ReadonlySet<Element> => {
	const cached = perfectElementsCache.get(element);
	if (cached) return cached;

	const matches = new Set<Element>();
	let complete = true;
	for (const other of ELEMENTS) {
		// Two people of the same element score 80, so an element is never a
		// perfect match for itself; skipping it also skips the impossible
		// "two differently named people of one element" probe.
		if (other === element) continue;

		const key = pairKey(element, other);
		const cachedScore = pairScoreCache.get(key);
		if (cachedScore !== undefined) {
			if (cachedScore === 100) matches.add(other);
			continue;
		}

		const from = peopleByElement.get(element) ?? [];
		const to = peopleByElement.get(other) ?? [];
		let probed = false;
		for (const left of from) {
			for (const right of to) {
				if (left.name === right.name) continue;
				const score = scorePair(left, right);
				pairScoreCache.set(key, score);
				recordsDiagnostics.pairScores = pairScoreCache.size;
				if (score === 100) matches.add(other);
				probed = true;
				break;
			}
			if (probed) break;
		}

		// An element pair nobody could be measured with stays unknown, and the
		// answer is deliberately not cached: a later, larger family can supply
		// the missing differently named pair.
		if (!probed) complete = false;
	}

	if (complete) perfectElementsCache.set(element, matches);
	return matches;
};

type RecordsSummary = {
	elder: Birthday;
	rookie: Birthday;
	/** `null` when nobody has a single perfect match. */
	socialite: { person: Birthday; count: number } | null;
	twins: readonly (readonly [Birthday, Birthday])[];
	/** Largest zodiac-sign cohort, when there is more than one of them. */
	sameSign: { sign: Birthday["sign"]; names: readonly string[] } | null;
	/** Largest generation cohort, when there is more than one of them. */
	sameGeneration: {
		generation: Birthday["generation"];
		names: readonly string[];
	} | null;
};

/** Largest group of at least two people sharing `key`, first one wins ties. */
const largestCohort = <K extends string>(
	people: readonly Birthday[],
	key: (person: Birthday) => K,
): { key: K; names: readonly string[] } | null => {
	const groups = new Map<K, string[]>();
	for (const person of people) {
		const group = groups.get(key(person));
		if (group) group.push(person.name);
		else groups.set(key(person), [person.name]);
	}

	let best: { key: K; names: readonly string[] } | null = null;
	for (const [groupKey, names] of groups) {
		if (names.length < 2) continue;
		if (!best || names.length > best.names.length) {
			best = { key: groupKey, names };
		}
	}
	return best;
};

/**
 * The four family records, derived from the people on screen.
 *
 * `people` excludes anniversaries (they have no age to rank) and may be a
 * single person, which is why the socialite and the twins are optional rather
 * than "the best of an empty set".
 */
export const computeRecords = (
	people: readonly Birthday[],
): RecordsSummary | null => {
	const first = people[0];
	if (!first) return null;

	let elder = first;
	let rookie = first;
	const peopleByElement = new Map<Element, Birthday[]>();
	const elementTotals = new Map<Element, number>();
	const namesByElement = new Map<Element, Map<string, number>>();

	for (const person of people) {
		if (person.age > elder.age) elder = person;
		if (person.age < rookie.age) rookie = person;

		const cohort = peopleByElement.get(person.element);
		if (cohort) cohort.push(person);
		else peopleByElement.set(person.element, [person]);

		elementTotals.set(
			person.element,
			(elementTotals.get(person.element) ?? 0) + 1,
		);
		const sameName =
			namesByElement.get(person.element) ?? new Map<string, number>();
		sameName.set(person.name, (sameName.get(person.name) ?? 0) + 1);
		namesByElement.set(person.element, sameName);
	}

	// Element totals make the socialite an O(4n) pass instead of an O(n^2) one,
	// and the name index keeps the original "never match yourself by name"
	// rule for the (rare) duplicate-name case.
	let socialite: RecordsSummary["socialite"] = null;
	for (const person of people) {
		let count = 0;
		for (const element of getPerfectElements(person.element, peopleByElement)) {
			const total = elementTotals.get(element) ?? 0;
			const sameName = namesByElement.get(element)?.get(person.name) ?? 0;
			count += total - sameName;
		}
		if (count === 0) continue;
		if (!socialite || count > socialite.count) socialite = { person, count };
	}

	const twins: (readonly [Birthday, Birthday])[] = [];
	const byMonthDay = new Map<string, Birthday[]>();
	for (const person of people) {
		const key = `${person.month}-${person.day}`;
		const group = byMonthDay.get(key);
		if (group) group.push(person);
		else byMonthDay.set(key, [person]);
	}
	for (const group of byMonthDay.values()) {
		for (const [i, first] of group.entries()) {
			for (const [j, second] of group.entries()) {
				if (j > i) twins.push([first, second]);
			}
		}
	}

	const signCohort = largestCohort(people, (person) => person.sign);
	const generationCohort = largestCohort(people, (person) => person.generation);

	return {
		elder,
		rookie,
		socialite,
		twins,
		sameSign: signCohort
			? { sign: signCohort.key, names: signCohort.names }
			: null,
		sameGeneration: generationCohort
			? { generation: generationCohort.key, names: generationCohort.names }
			: null,
	};
};

type RecordsWidgetProps = {
	data: readonly Birthday[];
};

const labelStyle: CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6,
	fontSize: 12,
	color: "var(--tk-text-dim)",
};

const valueStyle: CSSProperties = {
	display: "block",
	marginTop: 4,
	fontSize: "0.95rem",
	fontWeight: 600,
	color: "var(--tk-text)",
	overflowWrap: "anywhere",
};

const hintStyle: CSSProperties = {
	display: "block",
	marginTop: 2,
	fontSize: 11.5,
	color: "var(--tk-text-faint)",
};

const surfaceStyle: CSSProperties = {
	display: "block",
	width: "100%",
	padding: "10px 12px",
	borderRadius: "var(--app-radius-sm)",
	border: "1px solid var(--tk-border)",
	background: "var(--tk-surface-2)",
	textAlign: "left",
	color: "inherit",
	font: "inherit",
};

const RecordTile = ({
	icon,
	label,
	value,
	hint,
	tooltip,
	onSelect,
}: {
	icon: ReactNode;
	label: ReactNode;
	value: ReactNode;
	hint: ReactNode;
	tooltip?: string;
	onSelect?: () => void;
}) => {
	const body = (
		<>
			<span style={labelStyle}>
				{icon}
				{label}
			</span>
			<span style={valueStyle}>{value}</span>
			<span style={hintStyle}>{hint}</span>
		</>
	);

	// The tooltip is only attached to buttons, i.e. to tiles that a keyboard
	// can already reach. Non-actionable tiles carry their explanation in the
	// visible hint instead of in hover-only content.
	const content = onSelect ? (
		<button
			type="button"
			style={{ ...surfaceStyle, cursor: "pointer" }}
			onClick={onSelect}
		>
			{body}
		</button>
	) : (
		<div style={surfaceStyle}>{body}</div>
	);

	return tooltip ? (
		<Tooltip label={tooltip} withArrow>
			{content}
		</Tooltip>
	) : (
		content
	);
};

export const RecordsWidget = ({ data }: RecordsWidgetProps) => {
	const { t } = useTranslation();
	const people = useMemo(() => data.filter((x) => x.kind !== "💒"), [data]);

	const records = useMemo(() => {
		recordsDiagnostics.computations += 1;
		const summary = computeRecords(people);
		recordsDiagnostics.pairScores = pairScoreCache.size;
		return summary;
	}, [people]);

	// No visible people means no record can be awarded; the list above this
	// widget already explains an empty filter result.
	if (!records) return null;

	const socialite = records.socialite;
	const secondary: string[] = [];
	if (records.twins.length === 0) {
		if (records.sameSign) {
			secondary.push(
				t("app.records.same_sign_line", {
					names: records.sameSign.names.join(", "),
					sign: t(`data.zodiac.${records.sameSign.sign}`),
				}),
			);
		}
		if (records.sameGeneration) {
			secondary.push(
				t("app.records.same_generation_line", {
					names: records.sameGeneration.names.join(", "),
					generation: t(
						`data.generations.${records.sameGeneration.generation}`,
					),
				}),
			);
		}
	}

	return (
		<Card withBorder style={{ marginTop: 16 }}>
			<Text fw={600} style={{ marginBottom: 8 }}>
				{t("app.records.title")}
			</Text>
			<SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
				<RecordTile
					icon={<Crown size={13} strokeWidth={1.9} aria-hidden="true" />}
					label={t("app.records.elder")}
					value={records.elder.name}
					hint={`${records.elder.age} ${t("app.records.years")}`}
					tooltip={t("app.records.elder_tooltip", { name: records.elder.name })}
					onSelect={() => {
						dataStore.selectedBirthday = records.elder;
					}}
				/>
				<RecordTile
					icon={<Baby size={13} strokeWidth={1.9} aria-hidden="true" />}
					label={t("app.records.rookie")}
					value={records.rookie.name}
					hint={`${records.rookie.age} ${t("app.records.years")}`}
					tooltip={t("app.records.rookie_tooltip", {
						name: records.rookie.name,
					})}
					onSelect={() => {
						dataStore.selectedBirthday = records.rookie;
					}}
				/>
				<RecordTile
					icon={
						<HeartHandshake size={13} strokeWidth={1.9} aria-hidden="true" />
					}
					label={t("app.records.socialite")}
					value={socialite ? socialite.person.name : "—"}
					hint={
						socialite
							? t("app.records.perfect_matches", { count: socialite.count })
							: t("app.records.no_socialite")
					}
					tooltip={
						socialite
							? t("app.records.socialite_tooltip", {
									name: socialite.person.name,
									count: socialite.count,
								})
							: undefined
					}
					onSelect={
						socialite
							? () => {
									dataStore.selectedBirthday = socialite.person;
								}
							: undefined
					}
				/>
				<RecordTile
					icon={<Users size={13} strokeWidth={1.9} aria-hidden="true" />}
					label={t("app.records.twins")}
					value={`${records.twins.length} ${t("app.records.twins_suffix")}`}
					hint={
						records.twins.length > 0
							? records.twins
									.map((pair) => pair.map((x) => x.name).join(" & "))
									.join(", ")
							: t("app.records.no_twins")
					}
				/>
			</SimpleGrid>
			{secondary.length > 0 ? (
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: "4px 16px",
						marginTop: 10,
						fontSize: 11.5,
						color: "var(--tk-text-faint)",
					}}
				>
					{secondary.map((line) => (
						<span key={line}>{line}</span>
					))}
				</div>
			) : null}
		</Card>
	);
};
