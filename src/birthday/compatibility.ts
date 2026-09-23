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

export const getCompatibilityScore = (a: Birthday, b: Birthday): number => {
	if (a.name === b.name) return 100;
	if (a.element === b.element) return 80;
	return RELATIONSHIPS[`${a.element}-${b.element}`] ?? 40;
};
