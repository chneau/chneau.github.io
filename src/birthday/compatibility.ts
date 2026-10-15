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

export const isSameRecord = (a: Birthday, b: Birthday): boolean =>
	a.name === b.name && a.birthdayString === b.birthdayString;

export const getSameNamedRecords = (
	all: readonly Birthday[],
	record: Birthday,
): Birthday[] =>
	all.filter((b) => b.name === record.name && !isSameRecord(b, record));

export const getDuplicateRecords = (
	all: readonly Birthday[],
	record: Birthday,
): Birthday[] => all.filter((b) => b !== record && isSameRecord(b, record));

export const getCompatibilityScore = (a: Birthday, b: Birthday): number => {
	if (isSameRecord(a, b)) {
		if (a === b) return 100;
	}
	if (a.element === b.element) return 80;
	return RELATIONSHIPS[`${a.element}-${b.element}`] ?? 40;
};
