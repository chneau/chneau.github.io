import type { Birthday, Element } from "./birthdays";

const RELATIONSHIPS: Record<string, number> = {
	"fire-air": 100,
	"air-fire": 100,
	"earth-water": 100,
	"water-earth": 100,
	"fire-earth": 50,
	"earth-fire": 50,
	"air-water": 50,
	"water-air": 50,
};

export const getCompatibleElements = (element: Element): Element[] => {
	if (element === "fire" || element === "air") return ["fire", "air"];
	if (element === "earth" || element === "water") return ["earth", "water"];
	return [];
};

export const getScoreColor = (score: number): string => {
	if (score >= 90) return "#52c41a";
	if (score >= 80) return "#a0d911";
	if (score >= 50) return "#faad14";
	return "#f5222d";
};

/**
 * A record's identity in this data model is the exact `(name, birthdayString)`
 * pair.
 *
 * This is the identity the rest of the app already uses, not a new one:
 * `birthdays.ts` keys its CRUD on `(name, date)` — which is why
 * `ManageBirthdaysModal` calls `identityOf` the structural identity of a
 * stored record — and the record key is `${name}-${birthdayString}` in
 * `BirthdayTable` and `Countdown`. (`BirthdayTable` additionally folds `kind`
 * into a *React key* fingerprint, but that is a collision-avoidance device
 * for rows that share a name and a date, not a claim about who a person is.)
 *
 * `name` on its own is a *display* label, not an identifier, so a comparison
 * keyed on it fabricates matches between different people.
 *
 * `kind` is deliberately EXCLUDED. It is a user-editable classification rather
 * than a property of the person, so including it would let one person fork
 * their identity into two by re-filing their own row.
 *
 * The comparison is exact (case-sensitive) on purpose, matching the string keys
 * above: "Alex" and "alex" are two distinct rows as far as this data model is
 * concerned, and treating them as one would invent a match.
 */
export const isSameRecord = (a: Birthday, b: Birthday): boolean =>
	a.name === b.name && a.birthdayString === b.birthdayString;

/**
 * The other records in the list carrying the same display name: people the
 * user may well have meant to keep apart. Excludes `record` itself and any row
 * identical to it (see `getDuplicateRecords`), otherwise a row would be
 * reported as its own namesake.
 */
export const getSameNamedRecords = (
	all: readonly Birthday[],
	record: Birthday,
): Birthday[] =>
	all.filter((b) => b.name === record.name && !isSameRecord(b, record));

/**
 * Rows indistinguishable from `record`: same name *and* same birth date. The
 * data model has no id for them, so they can only be told apart by list
 * position. Duplicates remain reachable through the JSON import and the add
 * form, so callers should report this to the user rather than score the pair.
 */
export const getDuplicateRecords = (
	all: readonly Birthday[],
	record: Birthday,
): Birthday[] => all.filter((b) => b !== record && isSameRecord(b, record));

export const getCompatibilityScore = (a: Birthday, b: Birthday): number => {
	if (isSameRecord(a, b)) {
		// Only a record compared against *itself* is a guaranteed 100: the
		// element matrix says nothing about how a person matches themselves.
		//
		// Two *distinct* rows sharing both name and date cannot be told apart
		// in this data model. The pair may be one person entered twice, or two
		// people the data does not distinguish — so neither "same person"
		// (100) nor "incompatible" (40/50) is supportable; both would be
		// invented. Falling through to the element matrix is the least-wrong
		// option: it asserts only what the two rows literally share (an
		// identical birth date implies an identical sign and element, i.e. the
		// 80 diagonal) and never fabricates a self-match. Callers holding the
		// record list should use `getDuplicateRecords` and tell the user the
		// row is ambiguous.
		if (a === b) return 100;
	}
	if (a.element === b.element) return 80;
	return RELATIONSHIPS[`${a.element}-${b.element}`] ?? 40;
};
