import type { Birthday } from "./birthdays";

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

export const getCompatibilityScore = (a: Birthday, b: Birthday) => {
	if (a.name === b.name) return 100;
	if (a.element === b.element) return 80;
	return RELATIONSHIPS[`${a.element}-${b.element}`] ?? 40;
};
