import type { Birthday, Element } from "./birthdays";
import { getCompatibilityScore } from "./compatibility";

const ELEMENT_FLAGS: Record<Element, true> = {
	fire: true,
	earth: true,
	air: true,
	water: true,
};

const ELEMENTS = Object.keys(ELEMENT_FLAGS) as Element[];

const pairKey = (a: Element, b: Element) => `${a}|${b}`;

const pairScoreCache = new Map<string, number>();

export const recordsDiagnostics = {
	computations: 0,
	scorerCalls: 0,
	pairScores: 0,
};

const scorePair = (left: Birthday, right: Birthday): number => {
	recordsDiagnostics.scorerCalls += 1;
	return getCompatibilityScore(left, right);
};

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

		if (!probed) complete = false;
	}

	if (complete) perfectElementsCache.set(element, matches);
	return matches;
};

type RecordsSummary = {
	elder: Birthday;
	rookie: Birthday;
	socialite: { person: Birthday; count: number } | null;
	twins: readonly (readonly [Birthday, Birthday])[];
	sameSign: { sign: Birthday["sign"]; names: readonly string[] } | null;
	sameGeneration: {
		generation: Birthday["generation"];
		names: readonly string[];
	} | null;
};

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

export const measuredPairScores = (): number => pairScoreCache.size;
